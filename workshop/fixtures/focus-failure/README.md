# Focus Failure Fixture

Expected failure:

1. Open details from `Paper City`.
2. Press Back.
3. Home opens.
4. Focus incorrectly moves to the featured action.

Retry context:

```text
focus_restore failed: expected card "paper" after BACK, observed featured action "signal".
Read current navigation state, preserve unrelated work, and restore focus to the originating card.
```

Expected repaired path: `paper -> details -> BACK -> paper`.
