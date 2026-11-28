use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr::null_mut,
    thread,
};

use tauri::{AppHandle, Emitter, Manager, Runtime};
use windows_sys::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::Threading::INFINITE,
    UI::{
        Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, VK_X},
        WindowsAndMessaging::{
            MsgWaitForMultipleObjects, PeekMessageW, MSG, PM_REMOVE, QS_ALLINPUT, WM_HOTKEY,
            WM_QUIT,
        },
    },
};

pub struct ActivationEvent(OwnedHandle);

#[cfg(not(test))]
pub fn start_or_activate() -> io::Result<Option<ActivationEvent>> {
    open_activation_event("Local\\com.yida.chatgpt.next.web.activate")
}

fn open_activation_event(name: &str) -> io::Result<Option<ActivationEvent>> {
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::{CreateEventW, SetEvent},
    };
    let name: Vec<u16> = name.encode_utf16().chain([0]).collect();

    // Creating the event selects the first process atomically. An auto-reset event
    // also retains a launch request that arrives before the main window is ready.
    let handle = unsafe { CreateEventW(std::ptr::null(), 0, 0, name.as_ptr()) };
    let status = unsafe { GetLastError() };
    if handle.is_null() {
        return Err(io::Error::from_raw_os_error(status as i32));
    }
    let event = unsafe { OwnedHandle::from_raw_handle(handle) };
    if status == ERROR_ALREADY_EXISTS {
        if unsafe { SetEvent(event.as_raw_handle()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        return Ok(None);
    }
    Ok(Some(ActivationEvent(event)))
}

pub(super) fn listen<R: Runtime>(app: &tauri::App<R>) -> io::Result<()> {
    let Some(activation) = app.try_state::<ActivationEvent>() else {
        // The mock runtime has no process activation event.
        return Ok(());
    };
    let activation = activation.0.try_clone()?;
    let app = app.handle().clone();
    thread::Builder::new()
        .name("nextchat-desktop-events".into())
        .spawn(move || run_event_loop(&app, &activation))?;
    Ok(())
}

fn run_event_loop<R: Runtime>(app: &AppHandle<R>, activation: &OwnedHandle) {
    const HOTKEY_ID: i32 = 1;
    const MESSAGE_READY: u32 = WAIT_OBJECT_0 + 1;
    let hotkey_registered = unsafe {
        RegisterHotKey(
            null_mut(),
            HOTKEY_ID,
            MOD_CONTROL | MOD_ALT,
            u32::from(VK_X),
        ) != 0
    };
    if !hotkey_registered {
        eprintln!(
            "[Desktop] Could not register Ctrl+Alt+X: {}",
            io::Error::last_os_error()
        );
    }

    let event = activation.as_raw_handle();
    let mut message = MSG::default();
    'events: loop {
        match unsafe { MsgWaitForMultipleObjects(1, &event, 0, INFINITE, QS_ALLINPUT) } {
            WAIT_OBJECT_0 => activate(app, false),
            MESSAGE_READY => {
                while unsafe { PeekMessageW(&mut message, null_mut(), 0, 0, PM_REMOVE) } != 0 {
                    match message.message {
                        WM_QUIT => break 'events,
                        WM_HOTKEY if message.wParam == HOTKEY_ID as usize => activate(app, true),
                        _ => {}
                    }
                }
            }
            _ => {
                eprintln!(
                    "[Desktop] Activation listener stopped: {}",
                    io::Error::last_os_error()
                );
                break;
            }
        }
    }
    if hotkey_registered {
        unsafe { UnregisterHotKey(null_mut(), HOTKEY_ID) };
    }
}

fn activate<R: Runtime>(app: &AppHandle<R>, translation: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        super::show_main_window(&handle);
        if translation {
            let _ = handle.emit("open-translation", ());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::{Foundation::WAIT_TIMEOUT, System::Threading::WaitForSingleObject};

    #[test]
    fn repeat_launch_signals_the_first_instance_even_before_it_waits() {
        let name = format!("Local\\NextChat.activation-test.{}", std::process::id());
        let first = open_activation_event(&name).unwrap().unwrap();
        for _ in 0..2 {
            assert!(open_activation_event(&name).unwrap().is_none());
            let handle = first.0.as_raw_handle();
            assert_eq!(unsafe { WaitForSingleObject(handle, 0) }, WAIT_OBJECT_0);
            assert_eq!(unsafe { WaitForSingleObject(handle, 0) }, WAIT_TIMEOUT);
        }
        drop(first);
        assert!(open_activation_event(&name).unwrap().is_some());
    }
}
