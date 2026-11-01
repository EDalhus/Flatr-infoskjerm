# Metodene siden kaller (window.FlatrAndroid) må beholde navnene sine.
-keepclassmembers class no.flatr.tv.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
