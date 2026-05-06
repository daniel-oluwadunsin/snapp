// emulator not found
`nano ~/.zshrc`
export ANDROID_HOME=PATH_TO_ANDROID_SDK
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
`source ~/.zshrc`

// the one for abd too
