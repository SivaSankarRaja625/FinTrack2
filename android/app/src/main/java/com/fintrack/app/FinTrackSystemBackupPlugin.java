package com.fintrack.app;

import android.app.backup.BackupManager;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

@CapacitorPlugin(name = "FinTrackSystemBackup")
public class FinTrackSystemBackupPlugin extends Plugin {
    private static final int MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
    private static final String SNAPSHOT_DIRECTORY = "system-backup";
    private static final String SNAPSHOT_FILENAME = "finance.snapshot";

    private AtomicFile snapshotFile() throws IOException {
        File directory = new File(getContext().getFilesDir(), SNAPSHOT_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Could not create the system-backup directory");
        }
        return new AtomicFile(new File(directory, SNAPSHOT_FILENAME));
    }

    private void notifyBackupManager() {
        new BackupManager(getContext()).dataChanged();
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null) {
            call.reject("Snapshot data is required");
            return;
        }

        final byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Snapshot data is not valid base64", error);
            return;
        }
        if (bytes.length > MAX_SNAPSHOT_BYTES) {
            call.reject("The encrypted snapshot exceeds the 20 MB safety limit");
            return;
        }

        FileOutputStream output = null;
        try {
            AtomicFile target = snapshotFile();
            output = target.startWrite();
            output.write(bytes);
            output.getFD().sync();
            target.finishWrite(output);
            output = null;
            notifyBackupManager();
            JSObject result = new JSObject();
            result.put("size", bytes.length);
            call.resolve(result);
        } catch (IOException error) {
            if (output != null) {
                try {
                    snapshotFile().failWrite(output);
                } catch (IOException ignored) {
                    error.addSuppressed(ignored);
                }
            }
            call.reject("The encrypted snapshot could not be written", error);
        }
    }

    @PluginMethod
    public void readSnapshot(PluginCall call) {
        try {
            AtomicFile target = snapshotFile();
            File base = target.getBaseFile();
            JSObject result = new JSObject();
            if (!base.exists()) {
                result.put("data", JSObject.NULL);
                call.resolve(result);
                return;
            }
            if (base.length() > MAX_SNAPSHOT_BYTES) {
                call.reject("The restored encrypted snapshot exceeds the 20 MB safety limit");
                return;
            }

            try (
                FileInputStream input = target.openRead();
                ByteArrayOutputStream output = new ByteArrayOutputStream((int) base.length())
            ) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
                result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                call.resolve(result);
            }
        } catch (IOException error) {
            call.reject("The encrypted snapshot could not be read", error);
        }
    }

    @PluginMethod
    public void deleteSnapshot(PluginCall call) {
        try {
            snapshotFile().delete();
            notifyBackupManager();
            call.resolve();
        } catch (IOException error) {
            call.reject("The encrypted snapshot could not be deleted", error);
        }
    }
}
