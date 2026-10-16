use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Only a type identifier is accepted; no files are opened or created.
#[tauri::command]
pub async fn file_type_icon(
    app: tauri::AppHandle,
    extension: String,
    directory: bool,
) -> Result<Option<String>, String> {
    validate_extension(&extension)?;
    #[cfg(target_os = "macos")]
    let bytes = {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = sender.send(native_icon(&extension, directory));
        })
        .map_err(|e| e.to_string())?;
        receiver.await.map_err(|e| e.to_string())?
    };
    #[cfg(not(target_os = "macos"))]
    let bytes = {
        let _ = app;
        tauri::async_runtime::spawn_blocking(move || native_icon(&extension, directory))
            .await
            .map_err(|e| e.to_string())?
    };
    Ok(bytes.map(|bytes| format!("data:image/png;base64,{}", STANDARD.encode(bytes))))
}

fn validate_extension(extension: &str) -> Result<(), String> {
    if extension.len() > 128
        || extension
            .chars()
            .any(|c| c.is_control() || "/\\:".contains(c))
    {
        return Err("invalid file type".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn native_icon(extension: &str, directory: bool) -> Option<Vec<u8>> {
    use objc2::{rc::autoreleasepool, AnyThread};
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSCompositingOperation, NSGraphicsContext,
        NSWorkspace,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    autoreleasepool(|_| {
        let file_type = NSString::from_str(if directory {
            "public.folder"
        } else if extension.is_empty() {
            "public.data"
        } else {
            extension
        });
        // This API accepts extensions and UTIs, including types with no existing file.
        #[allow(deprecated)]
        let image = NSWorkspace::sharedWorkspace().iconForFileType(&file_type);
        let color_space = NSString::from_str("NSDeviceRGBColorSpace");
        // AppKit allocates and owns the 32x32 RGBA buffer (null data planes).
        let bitmap = unsafe {
            NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
                NSBitmapImageRep::alloc(), std::ptr::null_mut(), 32, 32, 8, 4,
                true, false, &color_space, 128, 32,
            )
        }?;
        let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&bitmap)?;
        NSGraphicsContext::saveGraphicsState_class();
        NSGraphicsContext::setCurrentContext(Some(&context));
        // Do not resize the shared NSWorkspace image; draw into our own bitmap.
        image.drawInRect_fromRect_operation_fraction(
            NSRect::new(NSPoint::ZERO, NSSize::new(32.0, 32.0)),
            NSRect::ZERO,
            NSCompositingOperation::Copy,
            1.0,
        );
        NSGraphicsContext::restoreGraphicsState_class();
        // An empty properties dictionary has no values of an incorrect ObjC type.
        unsafe {
            bitmap.representationUsingType_properties(
                NSBitmapImageFileType::PNG,
                &NSDictionary::new(),
            )
        }
        .map(|data| data.to_vec())
    })
}

#[cfg(target_os = "windows")]
fn native_icon(extension: &str, directory: bool) -> Option<Vec<u8>> {
    use std::{ffi::c_void, mem, ptr};
    use windows_sys::Win32::{
        Graphics::Gdi::*,
        Storage::FileSystem::{FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL},
        UI::{Shell::*, WindowsAndMessaging::*},
    };
    let name = if extension.is_empty() {
        "icon".into()
    } else {
        format!("icon.{extension}")
    };
    let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut info: SHFILEINFOW = mem::zeroed();
        let attributes = if directory {
            FILE_ATTRIBUTE_DIRECTORY
        } else {
            FILE_ATTRIBUTE_NORMAL
        };
        // USEFILEATTRIBUTES queries the shell association even for deleted files.
        if SHGetFileInfoW(
            wide.as_ptr(),
            attributes,
            &mut info,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_USEFILEATTRIBUTES,
        ) == 0
        {
            return None;
        }
        let dc = CreateCompatibleDC(ptr::null_mut());
        if dc.is_null() {
            DestroyIcon(info.hIcon);
            return None;
        }
        let mut header: BITMAPINFO = mem::zeroed();
        header.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
        header.bmiHeader.biWidth = 32;
        header.bmiHeader.biHeight = -32;
        header.bmiHeader.biPlanes = 1;
        header.bmiHeader.biBitCount = 32;
        header.bmiHeader.biCompression = BI_RGB;
        let mut pixels: *mut c_void = ptr::null_mut();
        let bitmap = CreateDIBSection(dc, &header, DIB_RGB_COLORS, &mut pixels, ptr::null_mut(), 0);
        if bitmap.is_null() || pixels.is_null() {
            if !bitmap.is_null() {
                DeleteObject(bitmap);
            }
            DeleteDC(dc);
            DestroyIcon(info.hIcon);
            return None;
        }
        let previous = SelectObject(dc, bitmap);
        if previous.is_null() || previous as isize == -1 {
            DeleteObject(bitmap);
            DeleteDC(dc);
            DestroyIcon(info.hIcon);
            return None;
        }
        ptr::write_bytes(pixels.cast::<u8>(), 0, 32 * 32 * 4);
        let drawn = DrawIconEx(dc, 0, 0, info.hIcon, 32, 32, 0, ptr::null_mut(), DI_NORMAL);
        GdiFlush();
        let mut rgba = std::slice::from_raw_parts(pixels.cast::<u8>(), 32 * 32 * 4).to_vec();
        // Older shell icons use a monochrome transparency mask instead of alpha.
        if drawn != 0 && rgba.chunks_exact(4).all(|pixel| pixel[3] == 0) {
            ptr::write_bytes(pixels.cast::<u8>(), 0, 32 * 32 * 4);
            if DrawIconEx(dc, 0, 0, info.hIcon, 32, 32, 0, ptr::null_mut(), DI_MASK) != 0 {
                GdiFlush();
                let mask = std::slice::from_raw_parts(pixels.cast::<u8>(), 32 * 32 * 4);
                for (pixel, mask) in rgba.chunks_exact_mut(4).zip(mask.chunks_exact(4)) {
                    pixel[3] = 255 - mask[0];
                }
            }
        }
        SelectObject(dc, previous);
        DeleteObject(bitmap);
        DeleteDC(dc);
        DestroyIcon(info.hIcon);
        if drawn == 0 {
            return None;
        }
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            // GDI draws premultiplied BGRA; PNG expects straight RGBA.
            let alpha = u32::from(pixel[3]);
            if alpha > 0 && alpha < 255 {
                for channel in &mut pixel[..3] {
                    *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
                }
            }
        }
        let mut png = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png, 32, 32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.write_header().ok()?.write_image_data(&rgba).ok()?;
        }
        Some(png)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn native_icon(_: &str, _: bool) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_requests_cannot_be_paths_or_unbounded_strings() {
        for value in ["php", "", "htaccess", "json", "custom-extension"] {
            assert!(validate_extension(value).is_ok());
        }
        for value in ["/etc/passwd", "C:\\file", "a\0b", &"a".repeat(129)] {
            assert!(validate_extension(value).is_err());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_provides_pngs_without_creating_files() {
        for (extension, directory) in [
            ("php", false),
            ("log", false),
            ("", false),
            ("", true),
            ("nonexistent-type-stonesvn", false),
        ] {
            let bytes = native_icon(extension, directory).expect("native icon");
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
            assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 32);
            assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 32);
        }
    }
}
