# Verify-retry Fixture

Use `../port-retry/port-recording.json` with the lesson 3 command. Its first `plan` turn omits the required remote-flow section, so the check fails, the exact failure joins the retry prompt, and the second turn repairs it. You are done when you can find that failure text in your terminal and in `port-result.json`.
