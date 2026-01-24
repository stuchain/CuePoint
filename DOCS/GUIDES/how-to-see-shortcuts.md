# How to See Keyboard Shortcuts & Accessibility Changes

## Quick Start Guide

### 1. Launch the Application

```bash
cd SRC
python gui_app.py
```

Or if you have a launcher script:
```bash
python SRC/gui_app.py
```

---

## Where to See the Changes

### 🎯 **Main Places to Check:**

### 1. **Menu Bar - Shortcuts Visible Automatically**
   - **File Menu**: 
     - "Open XML File..." → Shows `Ctrl+O` next to it
     - "Exit" → Shows `Ctrl+Q` next to it
   
   - **Edit Menu**:
     - "Copy" → Shows `Ctrl+C` next to it
     - "Select All" → Shows `Ctrl+A` next to it
   
   - **View Menu**:
     - "Full Screen" → Shows `F11` next to it
   
   - **Help Menu**:
     - "User Guide" → Shows `F1` next to it
     - "Keyboard Shortcuts" → Shows `Ctrl+?` next to it

### 2. **Tooltips - Hover Over Buttons**
   - **Start Processing Button**: 
     - Hover over it → See: "Start processing the selected playlist (F5)"
   
   - **Export Button** (in Results View):
     - Hover over it → See: "Export results to CSV, JSON, or Excel format (Ctrl+E)"
   
   - **Search Box** (in Results View):
     - Hover over it → See: "Search for tracks by title, artist, or Beatport data (Ctrl+F)"
   
   - **Clear Filters Button**:
     - Hover over it → See: "Reset all filters to default values (Ctrl+Shift+F)"

### 3. **Keyboard Shortcuts Dialog - The Main Feature!**
   
   **How to Open:**
   - Press `Ctrl+?` (or just `?` key)
   - OR go to **Help → Keyboard Shortcuts**
   
   **What You'll See:**
   - A dialog with **5 tabs**:
     1. **Global** - Shortcuts available everywhere
     2. **Main Window** - Shortcuts for main window
     3. **Results View** - Shortcuts for results table
     4. **Batch Processor** - Shortcuts for batch mode
     5. **Settings** - Shortcuts for settings
   
   - **Search box** at the top to filter shortcuts
   - **"Customize Shortcuts..."** button to customize

### 4. **Customize Shortcuts Dialog**
   
   **How to Open:**
   - Open Keyboard Shortcuts dialog (Ctrl+?)
   - Click **"Customize Shortcuts..."** button
   
   **What You'll See:**
   - Table with all shortcuts:
     - Column 1: Action ID
     - Column 2: Description
     - Column 3: Current Shortcut
   - **Double-click** any shortcut in column 3 to edit it
   - **Reset Selected** button to reset one shortcut
   - **Reset All** button to reset all shortcuts

### 5. **Accessibility Features - Visual Indicators**
   
   **What to Look For:**
   - **Tooltips**: Hover over any button/input → See helpful tooltip
   - **Focus Indicators**: 
     - Press `Tab` to navigate → See blue outline on focused elements
     - All buttons and inputs are keyboard accessible
   - **Label Associations**: 
     - Labels are properly associated with inputs (for screen readers)

---

## Quick Test Checklist

### ✅ **Test 1: See Shortcuts in Menus**
1. Open the app
2. Look at **File → Open XML File...** → Should show `Ctrl+O` on the right
3. Look at **Help → User Guide** → Should show `F1` on the right

### ✅ **Test 2: See Tooltips**
1. Hover over **"Start Processing"** button → See tooltip with `(F5)`
2. Hover over **Export** button (after processing) → See tooltip with `(Ctrl+E)`

### ✅ **Test 3: Open Shortcuts Dialog**
1. Press `Ctrl+?` OR press just `?` key
2. Should see dialog with tabs: Global, Main Window, Results View, etc.
3. Click through tabs to see different shortcuts

### ✅ **Test 4: Test a Shortcut**
1. Press `F1` → Should open User Guide dialog
2. Press `Ctrl+?` → Should open Keyboard Shortcuts dialog
3. Press `F11` → Should toggle fullscreen

### ✅ **Test 5: Customize a Shortcut**
1. Open Keyboard Shortcuts dialog (`Ctrl+?`)
2. Click **"Customize Shortcuts..."**
3. Double-click any shortcut in the "Shortcut" column
4. Press a new key combination
5. Click OK
6. Click Save
7. The shortcut should now be customized!

### ✅ **Test 6: Test Results View Shortcuts** (After Processing)
1. Process a playlist first
2. Press `Ctrl+F` → Search box should get focus
3. Press `Ctrl+A` → All results should be selected
4. Press `Ctrl+C` → Selected results copied to clipboard

---

## Visual Guide

### Menu Bar (Top of Window)
```
File    Edit    View    Help
├─ Open XML File...    Ctrl+O
├─ Exit                Ctrl+Q
│
Help
├─ User Guide          F1
└─ Keyboard Shortcuts  Ctrl+?
```

### Tooltips (Hover Over)
```
[Start Processing Button]
  ↓ (hover)
"Start processing the selected playlist (F5)"
```

### Keyboard Shortcuts Dialog
```
┌─────────────────────────────────────────┐
│ Keyboard Shortcuts                      │
├─────────────────────────────────────────┤
│ Search: [____________]                  │
├─────────────────────────────────────────┤
│ [Global] [Main Window] [Results View]...│
├─────────────────────────────────────────┤
│ Action              │ Shortcut          │
│ Open XML file       │ Ctrl+O            │
│ Export results      │ Ctrl+E            │
│ Show help           │ F1                │
│ ...                 │ ...               │
├─────────────────────────────────────────┤
│ [Customize Shortcuts...]                │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

### ❓ "I don't see shortcuts in menus"
- Make sure you're looking at the menu items (File, Edit, View, Help)
- Shortcuts appear on the right side of menu items automatically

### ❓ "Tooltips don't show shortcuts"
- Hover over buttons for 1-2 seconds
- Make sure you're hovering over interactive elements (buttons, inputs)

### ❓ "Ctrl+? doesn't work"
- Try pressing just `?` key (without Ctrl)
- Make sure the main window has focus
- Check Help → Keyboard Shortcuts menu item

### ❓ "Shortcuts dialog is empty"
- This shouldn't happen, but if it does, check the console for errors
- Make sure `shortcut_manager.py` is in `SRC/gui/` directory

---

## Summary

**Easiest Way to See Everything:**
1. **Open the app**
2. **Press `Ctrl+?`** (or `?` key) → Opens shortcuts dialog with all shortcuts
3. **Hover over buttons** → See tooltips with shortcuts
4. **Look at menus** → See shortcuts next to menu items

**That's it!** The shortcuts are integrated throughout the application and visible in multiple places for easy discovery.

