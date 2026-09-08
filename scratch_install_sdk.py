import subprocess
import os

env = os.environ.copy()
env["JAVA_HOME"] = r"C:\Program Files\Java\jdk-23"

sdkmanager = r"E:\Android\cmdline-tools\latest\bin\sdkmanager.bat"
sdk_root = r"E:\Android\sdk"

print("Accepting licenses...")
p = subprocess.Popen(
    [sdkmanager, f"--sdk_root={sdk_root}", "--licenses"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    env=env
)

out, _ = p.communicate(input="y\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\n")
print(out[-1000:])

print("\nInstalling packages...")
p2 = subprocess.Popen(
    [sdkmanager, f"--sdk_root={sdk_root}", "platform-tools", "platforms;android-34", "build-tools;34.0.0"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    env=env
)

out2, _ = p2.communicate(input="y\ny\ny\ny\ny\ny\ny\ny\ny\ny\n")
print(out2[-1000:])
