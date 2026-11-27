using System;
using System.Collections.Generic;
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
                error = "Unsupported semantic action: " + action;
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
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
