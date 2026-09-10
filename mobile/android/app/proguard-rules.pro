# Jitsi Meet + WebRTC use JNI reflection and must not be stripped.
-keep class org.jitsi.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# socket_io_client's Java engine (okhttp/websocket transport).
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# Firebase ships consumer rules in its AARs; nothing extra needed here.
