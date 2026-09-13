package com.davialvess.gestor;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingBytes;

    private final ActivityResultLauncher<Intent> fileChooser = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            Uri[] uris = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(uris);
                filePathCallback = null;
            }
        });

    private final ActivityResultLauncher<Intent> createDocument = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || pendingBytes == null) {
                pendingBytes = null;
                return;
            }
            Uri uri = result.getData().getData();
            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output != null) output.write(pendingBytes);
                Toast.makeText(this, "Arquivo salvo", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Não foi possível salvar o arquivo", Toast.LENGTH_LONG).show();
            } finally {
                pendingBytes = null;
            }
        });

    public class GestorAndroid {
        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64) {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(() -> {
                pendingBytes = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                createDocument.launch(intent);
            });
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try {
                    fileChooser.launch(intent);
                } catch (Exception error) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new GestorAndroid(), "GestorAndroid");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }
}
