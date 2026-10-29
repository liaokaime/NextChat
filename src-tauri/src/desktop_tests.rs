use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::mpsc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{CallbackFn, InvokeBody, InvokeResponseBody},
    test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
    Listener, Manager, WebviewWindow,
};
use tauri_plugin_fs::FsExt;

fn app() -> tauri::App<MockRuntime> {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    app_with_startup_path(std::env::temp_dir().join(format!("nextchat-startup-{unique}.json")))
}

fn app_with_startup_path(path: std::path::PathBuf) -> tauri::App<MockRuntime> {
    // Compile the real capabilities and register the production plugins/commands.
    // MockRuntime does not create an OS window or a WebView.
    let mut app = super::configure(
        mock_builder().manage(super::startup_window::StartupWindowStore::new(path)),
    )
    .build(tauri::generate_context!())
    .unwrap();
    // MockRuntime's build does not enter the event loop that normally runs setup.
    super::startup_window::setup(&mut app).unwrap();
    app
}

fn window(app: &tauri::App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
    if let Some(window) = app.get_webview_window(label) {
        return window;
    }
    tauri::WebviewWindowBuilder::new(app, label, Default::default())
        .build()
        .unwrap()
}

fn request(command: &str, body: Value) -> InvokeRequest {
    InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: if cfg!(windows) {
            "http://tauri.localhost/"
        } else {
            "tauri://localhost/"
        }
        .parse()
        .unwrap(),
        body: InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.into(),
    }
}

fn invoke(
    window: &WebviewWindow<MockRuntime>,
    command: &str,
    body: Value,
) -> Result<InvokeResponseBody, Value> {
    get_ipc_response(window, request(command, body))
}

#[test]
fn only_the_local_main_window_can_invoke_app_commands() {
    let app = app();
    let main = window(&app, "main");
    assert!(invoke(&main, "cancel_stream", json!({ "requestId": "missing" })).is_ok());

    let secondary = window(&app, "secondary");
    let denied = invoke(
        &secondary,
        "cancel_stream",
        json!({ "requestId": "missing" }),
    )
    .unwrap_err();
    assert!(denied.to_string().contains("not allowed"), "{denied}");

    let mut remote = request("cancel_stream", json!({ "requestId": "missing" }));
    remote.url = "https://example.invalid/".parse().unwrap();
    let denied = get_ipc_response(&main, remote).unwrap_err();
    assert!(denied.to_string().contains("not allowed"), "{denied}");
}

#[test]
fn startup_window_size_commands_are_allowed_for_the_local_main_window() {
    let app = app();
    assert!(
        !app.config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")
            .unwrap()
            .create,
        "the main window must be created by native setup with its saved dimensions"
    );
    assert!(app.get_webview_window("main").is_some());
    let main = window(&app, "main");
    let secondary = window(&app, "secondary");
    for (command, body) in [
        ("plugin:window|inner_size", json!({ "label": "main" })),
        ("plugin:window|scale_factor", json!({ "label": "main" })),
    ] {
        assert!(invoke(&main, command, body.clone()).is_ok(), "{command}");
        let denied = invoke(&secondary, command, body).unwrap_err();
        assert!(denied.to_string().contains("not allowed"), "{denied}");
    }
}

#[test]
fn native_startup_size_is_persisted_and_used_before_window_creation() {
    let app = app();
    let main = window(&app, "main");
    let store = app.state::<super::startup_window::StartupWindowStore>();
    let configured = &app.config().app.windows[0];
    for (width, height) in [(1280, 800), (1440, 900)] {
        invoke(
            &main,
            "save_startup_window_size",
            json!({ "size": { "width": width, "height": height } }),
        )
        .unwrap();
        let initial = super::startup_window::window_config(configured, &store.path);
        assert_eq!(
            (initial.width, initial.height),
            (f64::from(width), f64::from(height))
        );
        assert!(initial.visible);
    }
    let bytes = std::fs::read(&store.path).unwrap();
    let secondary = window(&app, "secondary");
    let denied = invoke(
        &secondary,
        "save_startup_window_size",
        json!({ "size": { "width": 960, "height": 600 } }),
    )
    .unwrap_err();
    assert!(denied.to_string().contains("not allowed"), "{denied}");
    for size in [
        json!({ "width": 0, "height": 800 }),
        json!({ "width": 1280, "height": 99999 }),
        json!({ "width": 1280.5, "height": 800 }),
    ] {
        assert!(invoke(&main, "save_startup_window_size", json!({ "size": size })).is_err());
        assert_eq!(std::fs::read(&store.path).unwrap(), bytes);
    }
    std::fs::remove_file(&store.path).unwrap();
}

#[test]
fn missing_or_corrupt_native_preferences_keep_a_visible_default_window() {
    let app = app();
    let store = app.state::<super::startup_window::StartupWindowStore>();
    let configured = &app.config().app.windows[0];
    for contents in [
        None,
        Some("broken JSON"),
        Some(r#"{"width":1,"height":600}"#),
    ] {
        if let Some(contents) = contents {
            std::fs::write(&store.path, contents).unwrap();
        }
        let initial = super::startup_window::window_config(configured, &store.path);
        assert_eq!((initial.width, initial.height), (960.0, 600.0));
        assert!(initial.visible);
    }
    std::fs::remove_file(&store.path).unwrap();
}

#[test]
fn file_writes_require_a_selected_path_and_reads_remain_denied() {
    let app = app();
    let main = window(&app, "main");
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("nextchat-acl-{unique}-中文.txt"));
    // Own the file before testing; never overwrite an existing file.
    std::fs::File::create_new(&path).unwrap();
    let encoded: String = path
        .to_str()
        .unwrap()
        .bytes()
        .map(|b| format!("%{b:02X}"))
        .collect();
    let write = || {
        let mut req = request("plugin:fs|write_text_file", Value::Null);
        req.body = InvokeBody::Raw("中文导出内容".as_bytes().to_vec());
        req.headers.insert("path", encoded.parse().unwrap());
        get_ipc_response(&main, req)
    };
    let denied = write().unwrap_err();
    assert!(denied.to_string().contains("forbidden path"), "{denied}");
    assert_eq!(std::fs::read(&path).unwrap(), b"");

    // This is the scope extension the official save dialog performs after selection.
    app.fs_scope().allow_file(&path).unwrap();
    write().unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "中文导出内容");
    let denied = invoke(&main, "plugin:fs|read_text_file", json!({ "path": path })).unwrap_err();
    assert!(denied.to_string().contains("not allowed"), "{denied}");
    std::fs::remove_file(path).unwrap();
}

#[test]
fn opener_rejects_non_web_schemes_and_file_access() {
    let app = app();
    let main = window(&app, "main");
    for url in [
        "file:///example.txt",
        "javascript:alert(1)",
        "custom:example",
    ] {
        let denied = invoke(&main, "plugin:opener|open_url", json!({ "url": url })).unwrap_err();
        assert!(
            denied.to_string().to_lowercase().contains("not allowed"),
            "{denied}"
        );
    }
    let denied = invoke(
        &main,
        "plugin:opener|open_path",
        json!({ "path": "/example.txt" }),
    )
    .unwrap_err();
    assert!(denied.to_string().contains("not allowed"), "{denied}");
}

#[test]
fn stream_ipc_preserves_http_metadata_and_utf8_error_bodies() {
    let app = app();
    let main = window(&app, "main");
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = "{\"error\":\"完整的中文错误信息\"}";
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut received = Vec::new();
        let mut byte = [0];
        while !received.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut byte).unwrap();
            received.push(byte[0]);
        }
        let headers = String::from_utf8(received).unwrap();
        assert!(headers.starts_with("POST /v1/messages HTTP/1.1\r\n"));
        assert!(headers.to_lowercase().contains("x-test: native-ipc\r\n"));
        let mut sent_body = [0; 2];
        socket.read_exact(&mut sent_body).unwrap();
        assert_eq!(&sent_body, b"{}");
        write!(socket, "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
    });
    let (sender, receiver) = mpsc::channel();
    app.listen_any("stream-response", move |event| {
        sender
            .send(serde_json::from_str::<Value>(event.payload()).unwrap())
            .unwrap();
    });
    let metadata = invoke(
        &main,
        "stream_fetch",
        json!({
            "requestId": "native-stream", "method": "POST",
            "url": format!("http://{address}/v1/messages"),
            "headers": { "X-Test": "native-ipc" }, "body": [123, 125]
        }),
    )
    .unwrap()
    .deserialize::<Value>()
    .unwrap();
    assert_eq!(metadata["status"], 401);
    assert_eq!(metadata["status_text"], "Unauthorized");
    assert_eq!(metadata["headers"]["content-type"], "application/json");
    let mut bytes = Vec::new();
    loop {
        let event = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(event["request_id"], "native-stream");
        assert!(event.get("error").is_none(), "{event}");
        if let Some(chunk) = event["chunk"].as_array() {
            bytes.extend(chunk.iter().map(|byte| byte.as_u64().unwrap() as u8));
        }
        if event["status"] == 0 {
            break;
        }
    }
    assert_eq!(String::from_utf8(bytes).unwrap(), body);
    server.join().unwrap();
}

#[test]
fn cancelling_stream_ipc_closes_http_before_and_after_response_headers() {
    let app = app();
    let main = window(&app, "main");
    for send_headers in [false, true] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut received = Vec::new();
            let mut byte = [0];
            while !received.ends_with(b"\r\n\r\n") {
                socket.read_exact(&mut byte).unwrap();
                received.push(byte[0]);
            }
            if send_headers {
                socket
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n",
                    )
                    .unwrap();
            }
            sender.send(()).unwrap();
            // Cancellation must drop the real HTTP connection, not only its JS listener.
            let closed = socket.read(&mut byte);
            assert!(
                matches!(closed, Ok(0))
                    || matches!(closed, Err(ref error) if matches!(error.kind(),
                        std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted)),
                "connection was not closed: {closed:?}"
            );
        });
        let pending_window = main.clone();
        let pending = std::thread::spawn(move || {
            invoke(
                &pending_window,
                "stream_fetch",
                json!({
                    "requestId": "native-cancel", "method": "GET",
                    "url": format!("http://{address}/slow"), "headers": {}, "body": []
                }),
            )
        });
        receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        let pending = if send_headers {
            assert!(pending.join().unwrap().is_ok());
            None
        } else {
            Some(pending)
        };
        invoke(
            &main,
            "cancel_stream",
            json!({ "requestId": "native-cancel" }),
        )
        .unwrap();
        if let Some(pending) = pending {
            let aborted = pending.join().unwrap().unwrap_err();
            assert!(aborted.to_string().contains("aborted"), "{aborted}");
        }
        server.join().unwrap();
    }
}
