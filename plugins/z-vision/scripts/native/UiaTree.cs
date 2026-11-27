using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Windows;
using System.Windows.Automation;

namespace ZVision.Native
{
    public static class UiaTree
    {
        private static readonly object CacheLock = new object();
        private static IntPtr _lastHwnd = IntPtr.Zero;
        private static List<AutomationElement> _lastElements = new List<AutomationElement>();

        public static List<object> SnapshotWindow(IntPtr hwnd, int maxNodes, string query, bool onlyInteractive)
        {
            List<object> result = new List<object>();
            List<AutomationElement> captured = new List<AutomationElement>();
            if (hwnd == IntPtr.Zero) return result;

            if (maxNodes <= 0) maxNodes = 120;
            if (maxNodes > 300) maxNodes = 300;
            string q = string.IsNullOrEmpty(query) ? null : query.Trim();

            AutomationElement root = null;
            TreeWalker walker = TreeWalker.ControlViewWalker;
            CacheRequest cacheReq = new CacheRequest();
            cacheReq.TreeScope = TreeScope.Element;
            cacheReq.AutomationElementMode = AutomationElementMode.Full;
            cacheReq.Add(AutomationElement.ControlTypeProperty);
            cacheReq.Add(AutomationElement.NameProperty);
            cacheReq.Add(AutomationElement.AutomationIdProperty);
            cacheReq.Add(AutomationElement.ClassNameProperty);
            cacheReq.Add(AutomationElement.IsEnabledProperty);
            cacheReq.Add(AutomationElement.IsOffscreenProperty);
            cacheReq.Add(AutomationElement.IsKeyboardFocusableProperty);
            cacheReq.Add(AutomationElement.BoundingRectangleProperty);
            cacheReq.Add(AutomationElement.IsInvokePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsValuePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsTogglePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsSelectionItemPatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsExpandCollapsePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsScrollPatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsRangeValuePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsGridPatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsTablePatternAvailableProperty);
            cacheReq.Add(AutomationElement.IsSelectionPatternAvailableProperty);
            cacheReq.Add(ValuePattern.Pattern);
            cacheReq.Add(ValuePattern.ValueProperty);

            using (cacheReq.Activate())
            {
                try
                {
                    root = AutomationElement.FromHandle(hwnd);
                }
                catch
                {
                    return result;
                }
                if (root == null) return result;

                Queue<KeyValuePair<AutomationElement, int>> queue = new Queue<KeyValuePair<AutomationElement, int>>();
                queue.Enqueue(new KeyValuePair<AutomationElement, int>(root, 0));

                int maxVisited = 1500;
                int visited = 0;

                while (queue.Count > 0 && result.Count < maxNodes && visited < maxVisited)
                {
                    KeyValuePair<AutomationElement, int> item = queue.Dequeue();
                    AutomationElement el = item.Key;
                    int depth = item.Value;
                    visited++;

                    AutomationElement.AutomationElementInformation cur;
                    string role;
                    string name;
                    string aid;
                    string cls;
                    bool enabled;
                    bool offscreen;
                    bool focusable;
                    Rect r;
                    bool usingCached = true;
                    try
                    {
                        cur = el.Cached;
                        role = MapControlType(cur.ControlType);
                        name = SafeStr(cur.Name);
                        aid = SafeStr(cur.AutomationId);
                        cls = SafeStr(cur.ClassName);
                        enabled = cur.IsEnabled;
                        offscreen = cur.IsOffscreen;
                        focusable = cur.IsKeyboardFocusable;
                        r = cur.BoundingRectangle;
                    }
                    catch
                    {
                        usingCached = false;
                        try
                        {
                            cur = el.Current;
                            role = MapControlType(cur.ControlType);
                            name = SafeStr(cur.Name);
                            aid = SafeStr(cur.AutomationId);
                            cls = SafeStr(cur.ClassName);
                            enabled = cur.IsEnabled;
                            offscreen = cur.IsOffscreen;
                            focusable = cur.IsKeyboardFocusable;
                            r = cur.BoundingRectangle;
                        }
                        catch
                        {
                            continue;
                        }
                    }

                    bool hasRect = !r.IsEmpty && !double.IsInfinity(r.Width) && !double.IsInfinity(r.Height) && r.Width > 0 && r.Height > 0;
                    List<object> patterns = usingCached ? GetCachedPatternNames(el) : GetSupportedPatternNames(el);
                    string val = usingCached ? TryReadCachedValue(el, patterns) : TryReadValue(el);
                    if (string.IsNullOrEmpty(val) && patterns.Contains("Selection"))
                    {
                        val = TryReadSelectionValue(el);
                    }

                    bool isInteractive = patterns.Count > 0 || focusable || IsInteractiveRole(role);
                    bool matchesQuery = true;
                    if (q != null)
                    {
                        matchesQuery = ContainsIgnoreCase(name, q) ||
                                       ContainsIgnoreCase(aid, q) ||
                                       ContainsIgnoreCase(val, q) ||
                                       ContainsIgnoreCase(role, q);
                    }

                    bool include = depth > 0 && hasRect && (!onlyInteractive || isInteractive) && matchesQuery;
                    if (include)
                    {
                        int idx = captured.Count;
                        captured.Add(el);

                        int rx = (int)Math.Round(r.X);
                        int ry = (int)Math.Round(r.Y);
                        int rw = (int)Math.Round(r.Width);
                        int rh = (int)Math.Round(r.Height);

                        Dictionary<string, object> node = new Dictionary<string, object>(StringComparer.Ordinal);
                        node["i"] = idx;
                        node["role"] = role;
                        node["name"] = Clip(name, 140);
                        node["aid"] = Clip(aid, 80);
                        node["cls"] = Clip(cls, 60);
                        if (!string.IsNullOrEmpty(val)) node["val"] = Clip(val, 140);
                        node["rect"] = new List<object> { rx, ry, rw, rh };
                        node["cx"] = rx + rw / 2;
                        node["cy"] = ry + rh / 2;
                        node["enabled"] = enabled;
                        node["offscreen"] = offscreen;
                        node["focusable"] = focusable;
                        node["patterns"] = patterns;
                        result.Add(node);
                    }

                    if (depth < 14)
                    {
                        try
                        {
                            AutomationElement child = walker.GetFirstChild(el);
                            int childGuard = 0;
                            while (child != null && childGuard < 180)
                            {
                                queue.Enqueue(new KeyValuePair<AutomationElement, int>(child, depth + 1));
                                child = walker.GetNextSibling(child);
                                childGuard++;
                            }
                        }
                        catch { }
                    }
                }
            }

            lock (CacheLock)
            {
                _lastHwnd = hwnd;
                _lastElements = captured;
            }
            return result;
        }

        public static bool TrySemanticAction(IntPtr hwnd, int index, string action, string text, out string error)
        {
            error = null;
            AutomationElement el = null;
            lock (CacheLock)
            {
                if (_lastHwnd != hwnd || index < 0 || index >= _lastElements.Count)
                {
                    error = "Cached UIA node index not available for this window";
                    return false;
                }
                el = _lastElements[index];
            }

            try
            {
                object patObj;
                if (action == "focus")
                {
                    el.SetFocus();
                    return true;
                }
                if (action == "invoke" || action == "click")
                {
                    if (el.TryGetCurrentPattern(InvokePattern.Pattern, out patObj))
                    {
                        ((InvokePattern)patObj).Invoke();
                        return true;
                    }
                    if (el.TryGetCurrentPattern(TogglePattern.Pattern, out patObj))
                    {
                        ((TogglePattern)patObj).Toggle();
                        return true;
                    }
                    if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out patObj))
                    {
                        ((SelectionItemPattern)patObj).Select();
                        return true;
                    }
                    error = "Element lacks Invoke/Toggle/SelectionItem pattern";
                    return false;
                }
                if (action == "set_value")
                {
                    if (el.TryGetCurrentPattern(ValuePattern.Pattern, out patObj))
                    {
                        ((ValuePattern)patObj).SetValue(text ?? "");
                        return true;
                    }
                    error = "Element lacks ValuePattern";
                    return false;
                }
                if (action == "scroll_into_view")
                {
                    if (el.TryGetCurrentPattern(ScrollItemPattern.Pattern, out patObj))
                    {
                        ((ScrollItemPattern)patObj).ScrollIntoView();
                        return true;
                    }
                    error = "Element lacks ScrollItemPattern";
                    return false;
                }
                if (action == "expand")
                {
                    if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out patObj))
                    {
                        ((ExpandCollapsePattern)patObj).Expand();
                        return true;
                    }
                    error = "Element lacks ExpandCollapsePattern";
                    return false;
                }
                if (action == "collapse")
                {
                    if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out patObj))
                    {
                        ((ExpandCollapsePattern)patObj).Collapse();
                        return true;
                    }
                    error = "Element lacks ExpandCollapsePattern";
                    return false;
                }
                if (action == "toggle")
                {
                    if (el.TryGetCurrentPattern(TogglePattern.Pattern, out patObj))
                    {
                        ((TogglePattern)patObj).Toggle();
                        return true;
                    }
                    error = "Element lacks TogglePattern";
                    return false;
                }
                if (action == "set_range")
                {
                    if (el.TryGetCurrentPattern(RangeValuePattern.Pattern, out patObj))
                    {
                        RangeValuePattern rv = (RangeValuePattern)patObj;
                        double val;
                        if (!double.TryParse((text ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out val))
                        {
                            error = "Invalid numeric range value: " + (text ?? "");
                            return false;
                        }
                        double min = rv.Current.Minimum;
                        double max = rv.Current.Maximum;
                        if (val < min) val = min;
                        if (val > max) val = max;
                        rv.SetValue(val);
                        return true;
                    }
                    error = "Element lacks RangeValuePattern";
                    return false;
                }
                if (action == "select_item")
                {
                    if (string.IsNullOrEmpty(text))
                    {
                        if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out patObj))
                        {
                            ((SelectionItemPattern)patObj).Select();
                            return true;
                        }
                        error = "Element lacks SelectionItemPattern";
                        return false;
                    }
                    bool expandedHere = false;
                    ExpandCollapsePattern expPat = null;
                    if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out patObj))
                    {
                        expPat = (ExpandCollapsePattern)patObj;
                        if (expPat.Current.ExpandCollapseState == ExpandCollapseState.Collapsed)
                        {
                            expPat.Expand();
                            expandedHere = true;
                            Thread.Sleep(60);
                        }
                    }
                    AutomationElement foundItem = FindDescendantByName(el, text.Trim(), 200);
                    if (foundItem == null)
                    {
                        if (expandedHere && expPat != null)
                        {
                            try { expPat.Collapse(); } catch { }
                        }
                        error = "Item not found in container: " + text;
                        return false;
                    }
                    bool selected = false;
                    object subPat;
                    if (foundItem.TryGetCurrentPattern(SelectionItemPattern.Pattern, out subPat))
                    {
                        ((SelectionItemPattern)subPat).Select();
                        selected = true;
                    }
                    else if (foundItem.TryGetCurrentPattern(InvokePattern.Pattern, out subPat))
                    {
                        ((InvokePattern)subPat).Invoke();
                        selected = true;
                    }
                    else
                    {
                        try { foundItem.SetFocus(); selected = true; } catch { }
                    }
                    if (expandedHere && expPat != null)
                    {
                        try
                        {
                            if (expPat.Current.ExpandCollapseState == ExpandCollapseState.Expanded)
                                expPat.Collapse();
                        }
                        catch { }
                    }
                    if (!selected)
                    {
                        error = "Found item lacks Select/Invoke pattern: " + text;
                        return false;
                    }
                    return true;
                }
                error = "Unsupported semantic action: " + action;
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        private static AutomationElement FindDescendantByName(AutomationElement root, string targetName, int maxVisit)
        {
            TreeWalker walker = TreeWalker.ControlViewWalker;
            Queue<AutomationElement> q = new Queue<AutomationElement>();
            AutomationElement firstChild = walker.GetFirstChild(root);
            while (firstChild != null)
            {
                q.Enqueue(firstChild);
                firstChild = walker.GetNextSibling(firstChild);
            }
            AutomationElement partialMatch = null;
            int visited = 0;
            while (q.Count > 0 && visited < maxVisit)
            {
                AutomationElement cur = q.Dequeue();
                visited++;
                string n = "";
                try { n = cur.Current.Name ?? ""; } catch { }
                if (string.Equals(n.Trim(), targetName, StringComparison.OrdinalIgnoreCase))
                    return cur;
                if (partialMatch == null && ContainsIgnoreCase(n, targetName))
                    partialMatch = cur;
                try
                {
                    AutomationElement c = walker.GetFirstChild(cur);
                    int g = 0;
                    while (c != null && g < 100)
                    {
                        q.Enqueue(c);
                        c = walker.GetNextSibling(c);
                        g++;
                    }
                }
                catch { }
            }
            return partialMatch;
        }

        public static Dictionary<string, object> ExtractTable(IntPtr hwnd, int index, int maxRows, int maxCols)
        {
            Dictionary<string, object> empty = new Dictionary<string, object>(StringComparer.Ordinal);
            empty["found"] = false;
            empty["headers"] = new List<object>();
            empty["rows"] = new List<object>();
            empty["row_count"] = 0;
            empty["col_count"] = 0;
            empty["truncated"] = false;
            if (hwnd == IntPtr.Zero) return empty;

            if (maxRows <= 0) maxRows = 100;
            if (maxRows > 500) maxRows = 500;
            if (maxCols <= 0) maxCols = 32;
            if (maxCols > 64) maxCols = 64;

            AutomationElement target = null;
            if (index >= 0)
            {
                lock (CacheLock)
                {
                    if (_lastHwnd == hwnd && index < _lastElements.Count)
                        target = _lastElements[index];
                }
            }
            if (target == null)
            {
                AutomationElement root = null;
                try { root = AutomationElement.FromHandle(hwnd); } catch { }
                if (root == null) return empty;

                TreeWalker walker = TreeWalker.ControlViewWalker;
                Queue<AutomationElement> q = new Queue<AutomationElement>();
                q.Enqueue(root);
                int visited = 0;
                while (q.Count > 0 && visited < 600)
                {
                    AutomationElement cur = q.Dequeue();
                    visited++;
                    if (cur != root)
                    {
                        try
                        {
                            ControlType ct = cur.Current.ControlType;
                            object pObj;
                            if (cur.TryGetCurrentPattern(TablePattern.Pattern, out pObj) ||
                                cur.TryGetCurrentPattern(GridPattern.Pattern, out pObj) ||
                                ct == ControlType.Table || ct == ControlType.DataGrid || ct == ControlType.List)
                            {
                                target = cur;
                                break;
                            }
                        }
                        catch { }
                    }
                    try
                    {
                        AutomationElement c = walker.GetFirstChild(cur);
                        int g = 0;
                        while (c != null && g < 120)
                        {
                            q.Enqueue(c);
                            c = walker.GetNextSibling(c);
                            g++;
                        }
                    }
                    catch { }
                }
            }
            if (target == null) return empty;

            List<object> headers = new List<object>();
            List<object> rows = new List<object>();
            int colCount = 0;
            bool truncated = false;

            object patObj;
            if (target.TryGetCurrentPattern(TablePattern.Pattern, out patObj))
            {
                try
                {
                    AutomationElement[] colHdrs = ((TablePattern)patObj).Current.GetColumnHeaders();
                    if (colHdrs != null)
                    {
                        for (int i = 0; i < colHdrs.Length && i < maxCols; i++)
                        {
                            headers.Add(SafeStr(colHdrs[i].Current.Name));
                        }
                    }
                }
                catch { }
            }

            TreeWalker tw = TreeWalker.ControlViewWalker;
            if (headers.Count == 0)
            {
                AutomationElement child = tw.GetFirstChild(target);
                while (child != null && headers.Count < maxCols)
                {
                    try
                    {
                        ControlType ct = child.Current.ControlType;
                        string cname = SafeStr(child.Current.Name);
                        if (ct == ControlType.Header || (ct == ControlType.Custom && string.Equals(cname, "Top Row", StringComparison.OrdinalIgnoreCase)))
                        {
                            AutomationElement hc = tw.GetFirstChild(child);
                            while (hc != null && headers.Count < maxCols)
                            {
                                string hname = SafeStr(hc.Current.Name);
                                if (!string.Equals(hname, "Top Left Header Cell", StringComparison.OrdinalIgnoreCase))
                                    headers.Add(hname);
                                hc = tw.GetNextSibling(hc);
                            }
                            if (headers.Count > 0) break;
                        }
                    }
                    catch { }
                    child = tw.GetNextSibling(child);
                }
            }

            if (target.TryGetCurrentPattern(GridPattern.Pattern, out patObj))
            {
                GridPattern grid = (GridPattern)patObj;
                int totalRows = 0;
                int totalCols = 0;
                try
                {
                    totalRows = grid.Current.RowCount;
                    totalCols = grid.Current.ColumnCount;
                }
                catch { }

                if (totalRows > maxRows || totalCols > maxCols) truncated = true;
                int rLimit = Math.Min(totalRows, maxRows);
                int cLimit = Math.Min(totalCols, maxCols);
                colCount = Math.Max(headers.Count, cLimit);

                for (int r = 0; r < rLimit; r++)
                {
                    List<object> rowCells = new List<object>();
                    for (int c = 0; c < cLimit; c++)
                    {
                        string cellText = "";
                        try
                        {
                            AutomationElement item = grid.GetItem(r, c);
                            if (item != null)
                            {
                                cellText = TryReadValue(item);
                                if (string.IsNullOrEmpty(cellText)) cellText = SafeStr(item.Current.Name);
                            }
                        }
                        catch { }
                        rowCells.Add(cellText);
                    }
                    rows.Add(rowCells);
                }
            }
            else
            {
                AutomationElement child = tw.GetFirstChild(target);
                while (child != null)
                {
                    try
                    {
                        ControlType ct = child.Current.ControlType;
                        string rname = SafeStr(child.Current.Name);
                        bool isRow = ct == ControlType.DataItem || ct == ControlType.ListItem || ct == ControlType.TreeItem ||
                                     (ct == ControlType.Custom && rname.StartsWith("Row", StringComparison.OrdinalIgnoreCase));
                        if (isRow)
                        {
                            if (rows.Count >= maxRows)
                            {
                                truncated = true;
                                break;
                            }
                            List<object> rowCells = new List<object>();
                            AutomationElement cell = tw.GetFirstChild(child);
                            while (cell != null && rowCells.Count < maxCols)
                            {
                                try
                                {
                                    ControlType cellCt = cell.Current.ControlType;
                                    string cellName = SafeStr(cell.Current.Name);
                                    if (cellCt == ControlType.Header || cellCt == ControlType.HeaderItem)
                                    {
                                        cell = tw.GetNextSibling(cell);
                                        continue;
                                    }
                                    string val = TryReadValue(cell);
                                    if (string.IsNullOrEmpty(val)) val = cellName;
                                    rowCells.Add(val);
                                }
                                catch { }
                                cell = tw.GetNextSibling(cell);
                            }
                            if (rowCells.Count == 0)
                            {
                                string v = TryReadValue(child);
                                rowCells.Add(string.IsNullOrEmpty(v) ? rname : v);
                            }
                            if (rowCells.Count > colCount) colCount = rowCells.Count;
                            rows.Add(rowCells);
                        }
                    }
                    catch { }
                    child = tw.GetNextSibling(child);
                }
                if (headers.Count > colCount) colCount = headers.Count;
            }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["found"] = true;
            try
            {
                res["control_type"] = MapControlType(target.Current.ControlType);
                res["name"] = SafeStr(target.Current.Name);
            }
            catch
            {
                res["control_type"] = "Unknown";
                res["name"] = "";
            }
            res["headers"] = headers;
            res["rows"] = rows;
            res["row_count"] = rows.Count;
            res["col_count"] = colCount;
            res["truncated"] = truncated;
            return res;
        }

        public static Dictionary<string, object> AutomateFileDialog(IntPtr hwnd, string filePath, bool confirm)
        {
            if (string.IsNullOrEmpty(filePath))
                throw new ArgumentException("invalid_argument: file_path is required for file_dialog");

            AutomationElement dialog = null;
            if (hwnd != IntPtr.Zero)
            {
                try
                {
                    AutomationElement el = AutomationElement.FromHandle(hwnd);
                    if (el != null && string.Equals(el.Current.ClassName, "#32770", StringComparison.Ordinal))
                        dialog = el;
                }
                catch { }
            }
            if (dialog == null)
            {
                TreeWalker rootWalker = TreeWalker.ControlViewWalker;
                AutomationElement child = rootWalker.GetFirstChild(AutomationElement.RootElement);
                int g = 0;
                while (child != null && g < 120)
                {
                    try
                    {
                        if (string.Equals(child.Current.ClassName, "#32770", StringComparison.Ordinal) && !child.Current.IsOffscreen)
                        {
                            dialog = child;
                            break;
                        }
                    }
                    catch { }
                    child = rootWalker.GetNextSibling(child);
                    g++;
                }
            }
            if (dialog == null)
                throw new InvalidOperationException("dialog_not_found: No active Windows #32770 file dialog found");

            AutomationElement pathEdit = null;
            AutomationElement confirmBtn = null;
            TreeWalker tw = TreeWalker.ControlViewWalker;
            Queue<AutomationElement> q = new Queue<AutomationElement>();
            q.Enqueue(dialog);
            int visited = 0;
            while (q.Count > 0 && visited < 400)
            {
                AutomationElement cur = q.Dequeue();
                visited++;
                try
                {
                    ControlType ct = cur.Current.ControlType;
                    string aid = cur.Current.AutomationId ?? "";
                    string name = SafeStr(cur.Current.Name);
                    if (ct == ControlType.Edit && (aid == "1148" || ContainsIgnoreCase(name, "File name") || ContainsIgnoreCase(name, "Tên tệp")))
                    {
                        if (aid == "1148" || pathEdit == null) pathEdit = cur;
                    }
                    else if (ct == ControlType.Button && (aid == "1" ||
                             string.Equals(name, "Open", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(name, "Save", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(name, "Mở", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(name, "Lưu", StringComparison.OrdinalIgnoreCase)))
                    {
                        if (aid == "1" || confirmBtn == null) confirmBtn = cur;
                    }
                }
                catch { }

                try
                {
                    AutomationElement c = tw.GetFirstChild(cur);
                    int cg = 0;
                    while (c != null && cg < 80)
                    {
                        q.Enqueue(c);
                        c = tw.GetNextSibling(c);
                        cg++;
                    }
                }
                catch { }
            }

            if (pathEdit == null)
                throw new InvalidOperationException("dialog_control_missing: File name Edit box not found in dialog");

            bool setOk = false;
            try
            {
                object pat;
                if (pathEdit.TryGetCurrentPattern(ValuePattern.Pattern, out pat))
                {
                    ((ValuePattern)pat).SetValue(filePath);
                    setOk = true;
                }
            }
            catch { }

            if (!setOk)
            {
                try { pathEdit.SetFocus(); } catch { }
                Thread.Sleep(30);
                InputArm.ClearAndType(filePath);
            }

            if (confirm)
            {
                Thread.Sleep(40);
                bool invoked = false;
                if (confirmBtn != null)
                {
                    try
                    {
                        object pat;
                        if (confirmBtn.TryGetCurrentPattern(InvokePattern.Pattern, out pat))
                        {
                            ((InvokePattern)pat).Invoke();
                            invoked = true;
                        }
                    }
                    catch { }
                }
                if (!invoked)
                {
                    try { pathEdit.SetFocus(); } catch { }
                    Thread.Sleep(20);
                    InputArm.PressChord("enter");
                }
            }

            long dlgHwnd = 0;
            try { dlgHwnd = dialog.Current.NativeWindowHandle; } catch { }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["executed"] = true;
            res["action"] = "file_dialog";
            res["dialog_hwnd"] = dlgHwnd;
            res["file_path"] = filePath;
            res["confirmed"] = confirm;
            return res;
        }

        public static string ComputeTreeHash(List<object> nodes)
        {
            ulong h = 14695981039346656037UL;
            if (nodes != null)
            {
                for (int i = 0; i < nodes.Count; i++)
                {
                    Dictionary<string, object> n = nodes[i] as Dictionary<string, object>;
                    if (n == null) continue;
                    FnvAdd(ref h, n.ContainsKey("role") ? Convert.ToString(n["role"]) : "");
                    FnvAdd(ref h, n.ContainsKey("name") ? Convert.ToString(n["name"]) : "");
                    FnvAdd(ref h, n.ContainsKey("aid") ? Convert.ToString(n["aid"]) : "");
                    FnvAdd(ref h, n.ContainsKey("val") ? Convert.ToString(n["val"]) : "");
                    FnvAdd(ref h, n.ContainsKey("enabled") ? Convert.ToString(n["enabled"]) : "");
                    List<object> rect = n.ContainsKey("rect") ? (n["rect"] as List<object>) : null;
                    if (rect != null && rect.Count == 4)
                    {
                        for (int k = 0; k < 4; k++) FnvAdd(ref h, Convert.ToString(rect[k]));
                    }
                }
            }
            return h.ToString("x16", System.Globalization.CultureInfo.InvariantCulture);
        }

        private static void FnvAdd(ref ulong h, string s)
        {
            if (s != null)
            {
                for (int i = 0; i < s.Length; i++)
                {
                    h ^= (byte)s[i];
                    h *= 1099511628211UL;
                }
            }
            h ^= 0xFF;
            h *= 1099511628211UL;
        }

        private static List<object> GetCachedPatternNames(AutomationElement el)
        {
            List<object> list = new List<object>();
            try
            {
                if (IsCachedFlag(el, AutomationElement.IsInvokePatternAvailableProperty)) list.Add("Invoke");
                if (IsCachedFlag(el, AutomationElement.IsValuePatternAvailableProperty)) list.Add("Value");
                if (IsCachedFlag(el, AutomationElement.IsTogglePatternAvailableProperty)) list.Add("Toggle");
                if (IsCachedFlag(el, AutomationElement.IsSelectionItemPatternAvailableProperty)) list.Add("Select");
                if (IsCachedFlag(el, AutomationElement.IsExpandCollapsePatternAvailableProperty)) list.Add("Expand");
                if (IsCachedFlag(el, AutomationElement.IsScrollPatternAvailableProperty)) list.Add("Scroll");
                if (IsCachedFlag(el, AutomationElement.IsRangeValuePatternAvailableProperty)) list.Add("Range");
                if (IsCachedFlag(el, AutomationElement.IsGridPatternAvailableProperty)) list.Add("Grid");
                if (IsCachedFlag(el, AutomationElement.IsTablePatternAvailableProperty)) list.Add("Table");
                if (IsCachedFlag(el, AutomationElement.IsSelectionPatternAvailableProperty)) list.Add("Selection");
            }
            catch { }
            return list;
        }

        private static bool IsCachedFlag(AutomationElement el, AutomationProperty prop)
        {
            object v = el.GetCachedPropertyValue(prop, true);
            return (v is bool) && (bool)v;
        }

        private static string TryReadCachedValue(AutomationElement el, List<object> patterns)
        {
            bool hasVal = false;
            for (int i = 0; i < patterns.Count; i++)
            {
                if (Equals(patterns[i], "Value")) { hasVal = true; break; }
            }
            if (!hasVal) return "";
            try
            {
                object v = el.GetCachedPropertyValue(ValuePattern.ValueProperty, true);
                if (v is string) return SafeStr((string)v);
            }
            catch { }
            return "";
        }

        private static List<object> GetSupportedPatternNames(AutomationElement el)
        {
            List<object> list = new List<object>();
            try
            {
                AutomationPattern[] pats = el.GetSupportedPatterns();
                for (int i = 0; i < pats.Length; i++)
                {
                    string pname = pats[i].ProgrammaticName;
                    if (pname == null) continue;
                    if (pname.StartsWith("InvokePattern", StringComparison.Ordinal)) list.Add("Invoke");
                    else if (pname.StartsWith("ValuePattern", StringComparison.Ordinal)) list.Add("Value");
                    else if (pname.StartsWith("TogglePattern", StringComparison.Ordinal)) list.Add("Toggle");
                    else if (pname.StartsWith("SelectionItemPattern", StringComparison.Ordinal)) list.Add("Select");
                    else if (pname.StartsWith("ExpandCollapsePattern", StringComparison.Ordinal)) list.Add("Expand");
                    else if (pname.StartsWith("ScrollPattern", StringComparison.Ordinal)) list.Add("Scroll");
                    else if (pname.StartsWith("RangeValuePattern", StringComparison.Ordinal)) list.Add("Range");
                    else if (pname.StartsWith("GridPattern", StringComparison.Ordinal)) list.Add("Grid");
                    else if (pname.StartsWith("TablePattern", StringComparison.Ordinal)) list.Add("Table");
                    else if (pname.StartsWith("SelectionPattern", StringComparison.Ordinal)) list.Add("Selection");
                }
            }
            catch { }
            return list;
        }

        private static string TryReadValue(AutomationElement el)
        {
            try
            {
                object patObj;
                if (el.TryGetCurrentPattern(ValuePattern.Pattern, out patObj))
                {
                    return ((ValuePattern)patObj).Current.Value ?? "";
                }
            }
            catch { }
            return "";
        }

        private static string TryReadSelectionValue(AutomationElement el)
        {
            try
            {
                object patObj;
                if (el.TryGetCurrentPattern(SelectionPattern.Pattern, out patObj))
                {
                    AutomationElement[] sel = ((SelectionPattern)patObj).Current.GetSelection();
                    if (sel != null && sel.Length > 0 && sel[0] != null)
                        return SafeStr(sel[0].Current.Name);
                }
            }
            catch { }
            return "";
        }

        private static string MapControlType(ControlType ct)
        {
            if (ct == null) return "Custom";
            string prog = ct.ProgrammaticName ?? "ControlType.Custom";
            int dot = prog.IndexOf('.');
            return dot >= 0 && dot + 1 < prog.Length ? prog.Substring(dot + 1) : prog;
        }

        private static bool IsInteractiveRole(string role)
        {
            return role == "Button" || role == "Edit" || role == "CheckBox" || role == "RadioButton" ||
                   role == "ComboBox" || role == "MenuItem" || role == "TabItem" || role == "ListItem" ||
                   role == "TreeItem" || role == "Hyperlink" || role == "Slider" || role == "DataItem";
        }

        private static bool ContainsIgnoreCase(string hay, string needle)
        {
            if (string.IsNullOrEmpty(hay) || string.IsNullOrEmpty(needle)) return false;
            return hay.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string SafeStr(string s)
        {
            return s == null ? "" : s.Replace('\r', ' ').Replace('\n', ' ').Trim();
        }

        private static string Clip(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Length <= max ? s : s.Substring(0, max - 3) + "...";
        }
    }
}
