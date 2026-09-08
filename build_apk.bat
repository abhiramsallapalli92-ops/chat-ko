@echo off
set JAVA_HOME=C:\Program Files\Java\jdk-23
set ANDROID_HOME=E:\Android\sdk
set GRADLE_USER_HOME=E:\gradle_home
cd /d c:\Users\abhir\Downloads\chatting\apps\web\android
call gradlew.bat assembleDebug
