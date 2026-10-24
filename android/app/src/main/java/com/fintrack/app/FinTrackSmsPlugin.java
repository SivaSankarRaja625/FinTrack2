package com.fintrack.app;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "FinTrackSms",
    permissions = {
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.READ_SMS }
        )
    }
)
public class FinTrackSmsPlugin extends Plugin {
    private static final int MAX_MESSAGES = 500;

    @PluginMethod
    public void listMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("Permission to read SMS was not granted");
            return;
        }

        Long sinceMs = call.getLong("sinceMs");
        if (sinceMs == null) {
            call.reject("sinceMs is required");
            return;
        }

        Long untilMs = call.getLong("untilMs");
        if (untilMs == null) {
            untilMs = System.currentTimeMillis();
        }

        Uri uri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] projection = new String[] {
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE
        };

        String selection = Telephony.Sms.DATE + " >= ? AND " + Telephony.Sms.DATE + " <= ?";
        String[] selectionArgs = new String[] {
            String.valueOf(sinceMs),
            String.valueOf(untilMs)
        };
        String sortOrder = Telephony.Sms.DATE + " DESC";

        JSArray messagesArray = new JSArray();
        ContentResolver cr = getContext().getContentResolver();

        try (Cursor cursor = cr.query(uri, projection, selection, selectionArgs, sortOrder)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID);
                int addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS);
                int bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY);
                int dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE);

                int count = 0;
                do {
                    JSObject item = new JSObject();
                    item.put("id", cursor.getString(idIdx));
                    item.put("address", cursor.getString(addressIdx));
                    item.put("body", cursor.getString(bodyIdx));
                    item.put("dateMs", cursor.getLong(dateIdx));
                    messagesArray.put(item);
                    count++;
                } while (cursor.moveToNext() && count < MAX_MESSAGES);
            }
        } catch (Exception e) {
            call.reject("Failed to query SMS inbox", e);
            return;
        }

        JSObject result = new JSObject();
        result.put("messages", messagesArray);
        call.resolve(result);
    }
}
