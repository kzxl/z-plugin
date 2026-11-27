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

            AutomationElement root;
            try
            {
                root = AutomationElement.FromHandle(hwnd);
            }
            catch
            {
                return result;
            }
            if (root == null) return result;

            TreeWalker walker = TreeWalker.ControlViewWalker;
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
                try
                {
                    cur = el.Current;
                }
                catch
                {
                    continue;
                }

                string role;
                string name;
                string aid;
                string cls;
                bool enabled;
                bool offscreen;
                bool focusable;
                Rect r;
                try
                {
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

                bool hasRect = !r.IsEmpty && !double.IsInfinity(r.Width) && !double.IsInfinity(r.Height) && r.Width > 0 && r.Height > 0;
                List<object> patterns = GetSupportedPatternNames(el);
                string val = TryReadValue(el);

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
