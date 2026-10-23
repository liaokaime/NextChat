use futures_util::{
    future::{AbortHandle, Abortable},
    StreamExt,
};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Default)]
pub struct Requests(Arc<Mutex<HashMap<String, AbortHandle>>>);

#[derive(serde::Serialize)]
pub struct StreamResponse {
    request_id: String,
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
}

#[derive(Clone, serde::Serialize)]
struct StreamEvent {
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    chunk: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub fn cancel_stream(request_id: String, requests: tauri::State<'_, Requests>) {
    if let Some(handle) = requests.0.lock().unwrap().remove(&request_id) {
        handle.abort();
    }
}

#[tauri::command]
pub async fn stream_fetch(
    window: tauri::Window,
    requests: tauri::State<'_, Requests>,
    request_id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
) -> Result<StreamResponse, String> {
    let mut request_headers = HeaderMap::new();
    for (key, value) in headers {
        request_headers.insert(
            key.parse::<HeaderName>().map_err(|e| e.to_string())?,
            value.parse::<HeaderValue>().map_err(|e| e.to_string())?,
        );
    }
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::limited(3))
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let request = client
        .request(
            method
                .parse::<reqwest::Method>()
                .map_err(|e| e.to_string())?,
            &url,
        )
        .headers(request_headers)
        .body(body);
    let (handle, registration) = AbortHandle::new_pair();
    requests
        .0
        .lock()
        .unwrap()
        .insert(request_id.clone(), handle);
    let response = match Abortable::new(request.send(), registration).await {
        Ok(Ok(response)) => response,
        result => {
            requests.0.lock().unwrap().remove(&request_id);
            return Err(match result {
                Ok(Err(e)) => e.to_string(),
                _ => "The operation was aborted.".into(),
            });
        }
    };
    let metadata = StreamResponse {
        request_id: request_id.clone(),
        status: response.status().as_u16(),
        status_text: response.status().canonical_reason().unwrap_or("").into(),
        headers: response
            .headers()
            .iter()
            .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
            .collect(),
    };
    let (handle, registration) = AbortHandle::new_pair();
    {
        let mut pending = requests.0.lock().unwrap();
        if !pending.contains_key(&request_id) {
            return Err("The operation was aborted.".into());
        }
        pending.insert(request_id.clone(), handle);
    }
    let pending = requests.0.clone();
    tauri::async_runtime::spawn(async move {
        let id = request_id.clone();
        let transfer = async {
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let event = match chunk {
                    Ok(bytes) => StreamEvent {
                        request_id: id.clone(),
                        chunk: Some(bytes.to_vec()),
                        status: None,
                        error: None,
                    },
                    Err(error) => {
                        let _ = window.emit(
                            "stream-response",
                            StreamEvent {
                                request_id: id.clone(),
                                chunk: None,
                                status: None,
                                error: Some(error.to_string()),
                            },
                        );
                        return;
                    }
                };
                if window.emit("stream-response", event).is_err() {
                    return;
                }
            }
            let _ = window.emit(
                "stream-response",
                StreamEvent {
                    request_id: id,
                    chunk: None,
                    status: Some(0),
                    error: None,
                },
            );
        };
        let _ = Abortable::new(transfer, registration).await;
        pending.lock().unwrap().remove(&request_id);
    });
    Ok(metadata)
}
