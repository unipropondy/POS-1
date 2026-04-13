# Unlock Table Fix — Apply After `git pull`

## Files to Change

---

## 1. `app/locked-tables.tsx`

### Change A — Fix `unlockTable` function (replace lines ~221–313)

Replace the entire `unlockTable` function with this:

```tsx
  const unlockTable = async (tableId: string, tableNumber: string) => {
    console.log(`🔓 UNLOCK REQUEST: Table ${tableNumber} (ID: ${tableId})`);

    if (!tableId || tableId === 'undefined') {
      console.error("❌ Table ID is missing!");
      Alert.alert("Error", "Table ID is missing. Please refresh and try again.");
      return;
    }

    // Clean the tableId in case it has braces (some SQL drivers wrap GUIDs)
    const cleanId = tableId.replace(/^\{|\}$/g, '').trim();

    // Validate GUID format: 8-4-4-4-12 hex chars with dashes
    const guidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!guidPattern.test(cleanId)) {
      console.error("❌ Invalid table ID format:", cleanId);
      Alert.alert(
        "Error",
        `Invalid table ID format: "${cleanId}". Please refresh and try again.`,
      );
      return;
    }

    Alert.alert(
      "Unlock Table",
      `Are you sure you want to unlock Table ${tableNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock",
          style: "destructive",
          onPress: async () => {
            try {
              console.log("🚀 Sending unlock request to server...");
              console.log("📤 Payload:", { tableId: cleanId });

              const res = await fetch(
                `${API_URL}/api/tables/unlock-persistent`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tableId: cleanId }),
                },
              );

              console.log("📥 Unlock response status:", res.status);

              // Read body ONCE — do not call res.json() and res.text() both
              const rawText = await res.text();
              console.log("📥 Unlock raw response:", rawText);

              let responseData: any = null;
              let errorMessage = "";

              try {
                responseData = JSON.parse(rawText);
                if (responseData?.error) {
                  errorMessage = responseData.error;
                }
              } catch (parseErr) {
                console.error("Failed to parse response as JSON:", parseErr);
                errorMessage = rawText || `HTTP ${res.status}`;
              }

              if (res.ok && responseData?.success) {
                console.log(`✅ Table ${tableNumber} unlocked successfully!`);
                console.log(`🔄 Refreshing table data...`);

                // Refresh the data to show updated state
                await fetchData();

                Alert.alert(
                  "✅ Unlocked",
                  `Table ${tableNumber} has been unlocked`,
                  [{ text: "OK" }],
                );
              } else {
                const fullError = errorMessage || rawText || `HTTP ${res.status}`;
                console.error("❌ Unlock failed:", {
                  status: res.status,
                  error: fullError,
                });
                Alert.alert(
                  "Unlock Failed",
                  `Failed to unlock table: ${fullError}`,
                );
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error("❌ Unlock error:", errorMsg);
              Alert.alert("Error", `Failed to unlock table: ${errorMsg}`);
            }
          },
        },
      ],
    );
  };
```

---

### Change B — Fix `renderTableItem` (THE PRIMARY BUG FIX)

**Problem:** The X (unlock) button is rendered BEFORE `tableContent` in JSX.
In React Native, the later sibling wins touch events when elements overlap.
Since `tableContent` has `flex: 1`, it covers the whole card INCLUDING the X button area, swallowing all touches.

**Fix:** Move the unlock button to render AFTER `tableContent`:

Replace the entire `renderTableItem` function with:

```tsx
  const renderTableItem = ({ item }: { item: TableType }) => (
    <View style={[styles.tableCard, item.isLocked && styles.lockedCard]}>
      {/* Main card content — rendered first so unlock btn renders ON TOP */}
      <TouchableOpacity
        style={styles.tableContent}
        onPress={() => {
          if (item.isLocked) {
            Alert.alert(
              "Locked Table",
              `Table ${item.tableNumber} is locked. Continue order processing?`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Continue Order",
                  onPress: () =>
                    continueWithOrder(item.tableNumber, item.diningSection),
                },
              ],
            );
          } else {
            lockTable(item.tableId, item.tableNumber);
          }
        }}
      >
        <View style={[styles.tableIcon, item.isLocked && styles.lockedIcon]}>
          <Ionicons
            name={item.isLocked ? "lock-closed" : "lock-open-outline"}
            size={24}
            color={item.isLocked ? "#fbbf24" : "#64748b"}
          />
        </View>
        <Text style={styles.tableNumber}>{item.tableNumber}</Text>
        <Text
          style={[styles.tableStatus, item.isLocked && styles.lockedStatus]}
        >
          {item.isLocked ? "LOCKED" : "AVAILABLE"}
        </Text>
      </TouchableOpacity>

      {/* Unlock (X) button — rendered AFTER tableContent so it sits on top and receives touches */}
      {item.isLocked && (
        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={() => {
            console.log(
              `👉 [TOUCH] "X" Button Pressed for Table ${item.tableNumber}`,
            );
            console.log(`📋 Table Details:`, {
              tableId: item.tableId,
              tableNumber: item.tableNumber,
              isLocked: item.isLocked,
            });
            unlockTable(item.tableId, item.tableNumber);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close-circle" size={22} color="#f87171" />
        </TouchableOpacity>
      )}
    </View>
  );
```

---

## 2. `pos-backend/server.js`

### Change — Add error logging in `unlock-persistent` catch block

Find this (around line 467–469):
```js
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MEMBERS ================= */
```

Replace with:
```js
  } catch (err) {
    console.error("❌ [UNLOCK] Error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

/* ================= MEMBERS ================= */
```

---

## Summary of Bugs Fixed

| # | Bug | File | Impact |
|---|-----|------|--------|
| 1 | **X button rendered before `tableContent` in JSX** — later sibling swallows its touches | `locked-tables.tsx` | **PRIMARY BUG — X press does nothing** |
| 2 | `res.json()` then `res.text()` — can't read response body twice | `locked-tables.tsx` | Error message lost on JSON parse failure |
| 3 | Weak GUID regex allows invalid formats; no brace-stripping | `locked-tables.tsx` | Could block valid GUIDs from SQL driver |
| 4 | No error logging in unlock catch block | `server.js` | Server errors invisible in console |
