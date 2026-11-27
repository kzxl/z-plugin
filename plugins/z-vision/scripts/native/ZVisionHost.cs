using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace ZVision.Native
{
    public static class ZVisionHost
    {
        public static int Main(string[] args)
        {
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);
            EnableDpiAwareness();

            InputArm.StartEmergencyHook();
            AppDomain.CurrentDomain.ProcessExit += delegate(object s, EventArgs e)
            {
                InputArm.ReleaseAll();
                InputArm.StopEmergencyHook();
            };

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (line.Length == 0) continue;

                object idVal = null;
                Dictionary<string, object> resp = new Dictionary<string, object>(StringComparer.Ordinal);
                try
                {
                    Dictionary<string, object> req = JsonMini.Parse(line) as Dictionary<string, object>;
                    if (req == null) throw new FormatException("Request must be JSON object");
                    idVal = req.ContainsKey("id") ? req["id"] : null;
                    string cmd = JsonMini.GetString(req, "cmd", "");
                    Dictionary<string, object> p = JsonMini.GetDict(req, "params") ?? new Dictionary<string, object>(StringComparer.Ordinal);

                    object result = Dispatch(cmd, p);
                    resp["id"] = idVal;
                    resp["ok"] = true;
                    resp["result"] = result;
                }
                catch (Exception ex)
                {
                    resp["id"] = idVal;
                    resp["ok"] = false;
                    Dictionary<string, object> err = new Dictionary<string, object>(StringComparer.Ordinal);
                    string code = "host_error";
                    string msg = ex.Message ?? "Unknown host error";
                    int colon = msg.IndexOf(':');
                    if (colon > 0 && colon < 32 && msg.Substring(0, colon).IndexOf(' ') < 0)
                    {
                        code = msg.Substring(0, colon);
                        msg = msg.Substring(colon + 1).Trim();
                    }
                    err["code"] = code;
                    err["message"] = msg;
                    resp["error"] = err;
                }

                Console.Out.WriteLine(JsonMini.Stringify(resp));
                Console.Out.Flush();
            }

            InputArm.ReleaseAll();
            InputArm.StopEmergencyHook();
            return 0;
        }

        private static object Dispatch(string cmd, Dictionary<string, object> p)
        {
            if (cmd == "ping" || cmd == "status") return HandleStatus();
            if (cmd == "ping" || cmd == "status") return HandleStatus();
            if (cmd == "windows") return HandleWindows(p);
            if (cmd == "window_info") return HandleWindowInfo(p);
            if (cmd == "launch") return HandleLaunch(p);
            if (cmd == "observe") return HandleObserve(p);
            if (cmd == "ocr") return HandleOcr(p);
            if (cmd == "match_template") return HandleMatchTemplate(p);
            if (cmd == "act") return HandleAct(p);
            if (cmd == "parallel") return HandleParallel(p);
            if (cmd == "stop") return HandleStop(p);
            throw new InvalidOperationException("unknown_command: " + cmd);
        }

        private static Dictionary<string, object> HandleStatus()
        {
            int cx, cy;
            InputArm.GetCursorPosition(out cx, out cy);
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["platform"] = "win32";
            res["pid"] = Process.GetCurrentProcess().Id;
            res["desktop"] = GetCurrentDesktopName();
            res["emergency_stopped"] = InputArm.IsEmergencyStopped;
            res["virtual_mouse"] = true;
            res["touch_injection_available"] = VirtualPointer.IsTouchAvailable();
            res["cursor_pos"] = new List<object> { cx, cy };
            res["winrt_ocr_available"] = VisionMath.IsWinRtOcrAvailable();
            res["ocr_languages"] = VisionMath.GetOcrLanguages();
            res["monitors"] = GetMonitors();
            return res;
        }

        private static Dictionary<string, object> HandleWindows(Dictionary<string, object> p)
        {
            bool includeHidden = JsonMini.GetBool(p, "include_hidden", false);
            string filter = JsonMini.GetString(p, "filter", "");
            IntPtr fg = GetForegroundWindow();
            List<object> list = new List<object>();

            EnumWindows(delegate(IntPtr hwnd, IntPtr lParam)
            {
                if (!includeHidden && !IsWindowVisible(hwnd)) return true;
                string title = GetWindowTitle(hwnd);
                if (!includeHidden && string.IsNullOrEmpty(title)) return true;

                RECT r;
                if (!GetVisibleWindowRect(hwnd, out r)) return true;
                int w = r.Right - r.Left;
                int h = r.Bottom - r.Top;
                if (!includeHidden && (w <= 0 || h <= 0)) return true;

                uint pid;
                GetWindowThreadProcessId(hwnd, out pid);
                string proc = GetProcessName(pid);

                if (!string.IsNullOrEmpty(filter))
                {
                    bool match = (title != null && title.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0) ||
                                 (proc != null && proc.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0);
                    if (!match) return true;
                }

                RECT cb;
                bool hasClient = GetClientBounds(hwnd, out cb);

                Dictionary<string, object> item = new Dictionary<string, object>(StringComparer.Ordinal);
                item["hwnd"] = hwnd.ToInt64();
                item["pid"] = (long)pid;
                item["process"] = proc;
                item["title"] = title;
                item["minimized"] = IsIconic(hwnd);
                item["foreground"] = (hwnd == fg);
                item["bounds"] = BoundsDict(r.Left, r.Top, w, h);
                if (hasClient) item["client_bounds"] = BoundsDict(cb.Left, cb.Top, Math.Max(0, cb.Right - cb.Left), Math.Max(0, cb.Bottom - cb.Top));
                list.Add(item);
                return true;
            }, IntPtr.Zero);

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["windows"] = list;
            return res;
        }

        private static Dictionary<string, object> HandleWindowInfo(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Window handle invalid");
            RECT r;
            if (!GetVisibleWindowRect(hwnd, out r)) throw new InvalidOperationException("window_not_found: Cannot query window bounds");
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);

            RECT cb;
            bool hasClient = GetClientBounds(hwnd, out cb);

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["hwnd"] = hwnd.ToInt64();
            res["pid"] = (long)pid;
            res["process"] = GetProcessName(pid);
            res["title"] = GetWindowTitle(hwnd);
            res["minimized"] = IsIconic(hwnd);
            res["bounds"] = BoundsDict(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
            if (hasClient) res["client_bounds"] = BoundsDict(cb.Left, cb.Top, Math.Max(0, cb.Right - cb.Left), Math.Max(0, cb.Bottom - cb.Top));
            return res;
        }

        private static Dictionary<string, object> HandleLaunch(Dictionary<string, object> p)
        {
            string exe = JsonMini.GetString(p, "exe", "");
            string args = JsonMini.GetString(p, "args", "");
            int timeoutMs = JsonMini.GetInt(p, "timeout_ms", 8000);
            if (string.IsNullOrEmpty(exe)) throw new ArgumentException("invalid_argument: exe is required");

            HashSet<long> preHwnds = new HashSet<long>();
            EnumWindows(delegate(IntPtr h, IntPtr lp)
            {
                if (IsWindowVisible(h)) preHwnds.Add(h.ToInt64());
                return true;
            }, IntPtr.Zero);

            string targetStem = Path.GetFileNameWithoutExtension(exe).ToLowerInvariant();
            ProcessStartInfo psi = new ProcessStartInfo(exe, args);
            psi.UseShellExecute = true;
            Process proc = Process.Start(psi);
            if (proc == null) throw new InvalidOperationException("launch_failed: Process failed to start");

            try { proc.WaitForInputIdle(Math.Min(timeoutMs, 3000)); } catch { }
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            IntPtr hwnd = IntPtr.Zero;
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    proc.Refresh();
                    if (!proc.HasExited && proc.MainWindowHandle != IntPtr.Zero)
                    {
                        hwnd = proc.MainWindowHandle;
                        break;
                    }
                }
                catch { }

                IntPtr foundNew = IntPtr.Zero;
                EnumWindows(delegate(IntPtr h, IntPtr lp)
                {
                    if (!IsWindowVisible(h) || preHwnds.Contains(h.ToInt64())) return true;
                    string t = GetWindowTitle(h);
                    if (string.IsNullOrEmpty(t)) return true;
                    uint wpid;
                    GetWindowThreadProcessId(h, out wpid);
                    string pname = GetProcessName(wpid).ToLowerInvariant();
                    if (wpid == (uint)proc.Id || (!string.IsNullOrEmpty(targetStem) && pname.Contains(targetStem)))
                    {
                        foundNew = h;
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);

                if (foundNew != IntPtr.Zero) { hwnd = foundNew; break; }
                Thread.Sleep(120);
            }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["pid"] = proc.Id;
            res["hwnd"] = hwnd.ToInt64();
            string resolvedProc = proc.ProcessName + ".exe";
            if (hwnd != IntPtr.Zero)
            {
                uint rpid;
                GetWindowThreadProcessId(hwnd, out rpid);
                string hp = GetProcessName(rpid);
                if (!string.IsNullOrEmpty(hp)) resolvedProc = hp;
                res["pid"] = (long)rpid;
            }
            res["process"] = resolvedProc;
            res["title"] = hwnd != IntPtr.Zero ? GetWindowTitle(hwnd) : "";
            if (hwnd != IntPtr.Zero)
            {
                RECT r;
                if (GetVisibleWindowRect(hwnd, out r)) res["bounds"] = BoundsDict(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
                RECT cb;
                if (GetClientBounds(hwnd, out cb)) res["client_bounds"] = BoundsDict(cb.Left, cb.Top, Math.Max(0, cb.Right - cb.Left), Math.Max(0, cb.Bottom - cb.Top));
            }
            return res;
        }

        private static Dictionary<string, object> HandleObserve(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Target window not found");

            int maxNodes = JsonMini.GetInt(p, "max_nodes", 120);
            string query = JsonMini.GetString(p, "query", "");
            bool onlyInteractive = JsonMini.GetBool(p, "only_interactive", false);
            bool withImage = JsonMini.GetBool(p, "with_image", true);
            bool withOcr = JsonMini.GetBool(p, "with_ocr", false);
            int maxWidth = JsonMini.GetInt(p, "max_width", 1280);
            int settleMs = JsonMini.GetInt(p, "settle_ms", 0);
            string ocrLang = JsonMini.GetString(p, "language", "");
            string savePath = JsonMini.GetString(p, "save_path", "");

            if (settleMs > 0) Thread.Sleep(Math.Min(settleMs, 2000));

            RECT visRect;
            if (!GetVisibleWindowRect(hwnd, out visRect)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            RECT rawRect;
            if (!GetWindowRect(hwnd, out rawRect)) rawRect = visRect;
            RECT clientRect;
            bool hasClient = GetClientBounds(hwnd, out clientRect);

            int winW = Math.Max(1, visRect.Right - visRect.Left);
            int winH = Math.Max(1, visRect.Bottom - visRect.Top);

            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            string proc = GetProcessName(pid);
            string title = GetWindowTitle(hwnd);

            List<object> nodes = UiaTree.SnapshotWindow(hwnd, maxNodes, query, onlyInteractive);

            string dhashHex = "0000000000000000";
            string imageB64 = null;
            string imageMime = null;
            int imgW = winW;
            int imgH = winH;
            Dictionary<string, object> ocrResult = null;

            using (Bitmap rawBmp = CaptureVisibleWindowBitmap(hwnd, rawRect, visRect))
            {
                if (rawBmp != null)
                {
                    dhashHex = VisionMath.ToHex(VisionMath.ComputeDHash(rawBmp));
                    if (withOcr)
                    {
                        ocrResult = VisionMath.RunWinRtOcr(rawBmp, ocrLang, visRect.Left, visRect.Top);
                    }
                    if (withImage || !string.IsNullOrEmpty(savePath))
                    {
                        using (Bitmap scaled = ScaleBitmapIfNeeded(rawBmp, maxWidth))
                        {
                            imgW = scaled.Width;
                            imgH = scaled.Height;
                            if (!string.IsNullOrEmpty(savePath))
                            {
                                string dir = Path.GetDirectoryName(savePath);
                                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                SaveJpeg(scaled, savePath, 84L);
                            }
                            if (withImage)
                            {
                                imageB64 = EncodeJpegBase64(scaled, 80L);
                                imageMime = "image/jpeg";
                            }
                        }
                    }
                }
            }

            Dictionary<string, object> imgSize = new Dictionary<string, object>(StringComparer.Ordinal);
            imgSize["w"] = withImage ? imgW : winW;
            imgSize["h"] = withImage ? imgH : winH;

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["hwnd"] = hwnd.ToInt64();
            res["pid"] = (long)pid;
            res["process"] = proc;
            res["title"] = title;
            res["bounds"] = BoundsDict(visRect.Left, visRect.Top, winW, winH);
            res["raw_bounds"] = BoundsDict(rawRect.Left, rawRect.Top, Math.Max(1, rawRect.Right - rawRect.Left), Math.Max(1, rawRect.Bottom - rawRect.Top));
            if (hasClient) res["client_bounds"] = BoundsDict(clientRect.Left, clientRect.Top, Math.Max(0, clientRect.Right - clientRect.Left), Math.Max(0, clientRect.Bottom - clientRect.Top));
            res["image_size"] = imgSize;
            res["dhash"] = dhashHex;
            res["nodes"] = nodes;
            if (ocrResult != null) res["ocr"] = ocrResult;
            if (imageB64 != null)
            {
                res["image_base64"] = imageB64;
                res["image_mime"] = imageMime;
            }
            return res;
        }

        private static Dictionary<string, object> HandleOcr(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            string lang = JsonMini.GetString(p, "language", "");
            List<object> roi = JsonMini.GetList(p, "roi");

            int capX = 0, capY = 0, capW = 0, capH = 0;
            Bitmap bmp = null;
            try
            {
                if (roi != null && roi.Count == 4)
                {
                    capX = Convert.ToInt32(roi[0]);
                    capY = Convert.ToInt32(roi[1]);
                    capW = Math.Max(1, Convert.ToInt32(roi[2]));
                    capH = Math.Max(1, Convert.ToInt32(roi[3]));
                    bmp = CaptureScreenRect(capX, capY, capW, capH);
                }
                else
                {
                    if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
                    if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Window not found for OCR");
                    RECT r;
                    if (!GetWindowRect(hwnd, out r)) throw new InvalidOperationException("window_not_found: Cannot read bounds");
                    capX = r.Left; capY = r.Top;
                    capW = Math.Max(1, r.Right - r.Left);
                    capH = Math.Max(1, r.Bottom - r.Top);
                    bmp = CaptureWindowBitmap(hwnd, capX, capY, capW, capH);
                }

                Dictionary<string, object> res = VisionMath.RunWinRtOcr(bmp, lang, capX, capY);
                res["hwnd"] = hwnd.ToInt64();
                return res;
            }
            finally
            {
                if (bmp != null) bmp.Dispose();
            }
        }

        private static Dictionary<string, object> HandleMatchTemplate(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            string tplPath = JsonMini.GetString(p, "template_path", "");
            double minScore = JsonMini.GetDouble(p, "min_score", 0.85);
            if (string.IsNullOrEmpty(tplPath) || !File.Exists(tplPath))
                throw new ArgumentException("invalid_argument: template_path does not exist");

            RECT r;
            if (!GetWindowRect(hwnd, out r)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            int winW = Math.Max(1, r.Right - r.Left);
            int winH = Math.Max(1, r.Bottom - r.Top);

            using (Bitmap screen = CaptureWindowBitmap(hwnd, r.Left, r.Top, winW, winH))
            using (Bitmap tpl = new Bitmap(tplPath))
            {
                Dictionary<string, object> match = VisionMath.FindTemplateNcc(screen, tpl, minScore);
                if (JsonMini.GetBool(match, "found", false))
                {
                    match["screen_cx"] = r.Left + JsonMini.GetInt(match, "cx", 0);
                    match["screen_cy"] = r.Top + JsonMini.GetInt(match, "cy", 0);
                }
                return match;
            }
        }

        private static Dictionary<string, object> HandleAct(Dictionary<string, object> p)
        {
            return ExecuteActInternal(p, 1);
        }

        private static Dictionary<string, object> ExecuteActInternal(Dictionary<string, object> p, int arrowId)
        {
            if (InputArm.IsEmergencyStopped)
                throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            string action = JsonMini.GetString(p, "action", "");
            string mode = JsonMini.GetString(p, "mode", "physical").ToLowerInvariant();
            int x = JsonMini.GetInt(p, "x", 0);
            int y = JsonMini.GetInt(p, "y", 0);
            int index = JsonMini.GetInt(p, "index", -1);
            bool physical = JsonMini.GetBool(p, "physical", true);
            bool restoreCursor = JsonMini.GetBool(p, "restore_cursor", false);
            bool showArrows = JsonMini.GetBool(p, "show_arrows", mode != "physical");

            int savedCx = 0, savedCy = 0;
            bool shouldRestore = restoreCursor && mode == "physical" && action != "move";
            if (shouldRestore) InputArm.GetCursorPosition(out savedCx, out savedCy);

            try
            {
                if (mode == "physical" && hwnd != IntPtr.Zero && IsWindow(hwnd) && action != "move")
                {
                    FocusWindow(hwnd);
                    Thread.Sleep(35);
                }

                if (action == "focus")
                {
                    if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                    FocusWindow(hwnd);
                }
                else if (action == "click" || action == "double_click" || action == "right_click")
                {
                    if (!physical && index >= 0 && hwnd != IntPtr.Zero)
                    {
                        string uiaErr;
                        if (!UiaTree.TrySemanticAction(hwnd, index, "click", null, out uiaErr))
                            throw new InvalidOperationException("semantic_failed: " + uiaErr);
                    }
                    else
                    {
                        string btn = action == "right_click" ? "right" : JsonMini.GetString(p, "button", "left");
                        int clicks = action == "double_click" ? 2 : JsonMini.GetInt(p, "clicks", 1);
                        if (mode == "virtual" && hwnd != IntPtr.Zero)
                        {
                            VirtualPointer.VirtualClick(hwnd, x, y, btn, clicks, arrowId, showArrows);
                        }
                        else if (mode == "touch")
                        {
                            List<List<int[]>> tracks = new List<List<int[]>>();
                            List<int[]> pt = new List<int[]>();
                            pt.Add(new int[] { x, y });
                            pt.Add(new int[] { x, y });
                            tracks.Add(pt);
                            VirtualPointer.MultiTouchDrag(tracks, 1, showArrows);
                        }
                        else
                        {
                            InputArm.Click(x, y, btn, clicks);
                        }
                    }
                }
                else if (action == "move")
                {
                    if (mode == "virtual" && hwnd != IntPtr.Zero)
                        VirtualPointer.VirtualMove(hwnd, x, y, arrowId, showArrows);
                    else
                        InputArm.MoveSmooth(x, y, JsonMini.GetInt(p, "steps", 6));
                }
                else if (action == "drag")
                {
                    List<int[]> pts = ParseDragPoints(p);
                    string btn = JsonMini.GetString(p, "button", "left");
                    int steps = JsonMini.GetInt(p, "steps", 8);
                    if (mode == "virtual" && hwnd != IntPtr.Zero)
                    {
                        VirtualPointer.VirtualDrag(hwnd, pts, btn, steps, arrowId, showArrows);
                    }
                    else if (mode == "touch")
                    {
                        List<List<int[]>> tracks = new List<List<int[]>>();
                        tracks.Add(pts);
                        VirtualPointer.MultiTouchDrag(tracks, steps, showArrows);
                    }
                    else
                    {
                        InputArm.Drag(pts, btn, steps);
                    }
                }
                else if (action == "scroll")
                {
                    int amount = JsonMini.GetInt(p, "amount", -3);
                    bool horiz = JsonMini.GetBool(p, "horizontal", false);
                    if (mode == "virtual" && hwnd != IntPtr.Zero)
                        VirtualPointer.VirtualScroll(hwnd, x, y, amount, horiz);
                    else
                        InputArm.Scroll(x, y, amount, horiz);
                }
                else if (action == "type")
                {
                    string text = JsonMini.GetString(p, "text", "");
                    if (mode == "virtual" && hwnd != IntPtr.Zero)
                    {
                        if (p.ContainsKey("x") && p.ContainsKey("y") && JsonMini.GetBool(p, "click_first", false))
                            VirtualPointer.VirtualClick(hwnd, x, y, "left", 1, arrowId, showArrows);
                        VirtualPointer.VirtualType(hwnd, text);
                    }
                    else
                    {
                        if (p.ContainsKey("x") && p.ContainsKey("y") && JsonMini.GetBool(p, "click_first", false))
                        {
                            InputArm.Click(x, y, "left", 1);
                            Thread.Sleep(25);
                        }
                        InputArm.TypeUnicode(text);
                    }
                }
                else if (action == "paste")
                {
                    if (p.ContainsKey("x") && p.ContainsKey("y") && JsonMini.GetBool(p, "click_first", false))
                    {
                        InputArm.Click(x, y, "left", 1);
                        Thread.Sleep(25);
                    }
                    InputArm.PasteText(JsonMini.GetString(p, "text", ""));
                }
                else if (action == "set_value")
                {
                    string valText = JsonMini.GetString(p, "text", "");
                    if (index >= 0 && hwnd != IntPtr.Zero)
                    {
                        string uiaErr;
                        if (UiaTree.TrySemanticAction(hwnd, index, "set_value", valText, out uiaErr))
                        {
                            Dictionary<string, object> okRes = new Dictionary<string, object>(StringComparer.Ordinal);
                            okRes["executed"] = true;
                            okRes["action"] = action;
                            okRes["semantic"] = true;
                            return okRes;
                        }
                    }
                    if (p.ContainsKey("x") && p.ContainsKey("y"))
                    {
                        InputArm.Click(x, y, "left", 1);
                        Thread.Sleep(25);
                    }
                    InputArm.PressChord("ctrl+a");
                    Thread.Sleep(15);
                    InputArm.TypeUnicode(valText);
                }
                else if (action == "key")
                {
                    InputArm.PressChord(JsonMini.GetString(p, "keys", ""));
                }
                else if (action == "resize")
                {
                    if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                    int cw = JsonMini.GetInt(p, "width", 800);
                    int ch = JsonMini.GetInt(p, "height", 600);
                    SetWindowPos(hwnd, IntPtr.Zero, 0, 0, cw, ch, SWP_NOMOVE | SWP_NOZORDER);
                }
                else
                {
                    throw new ArgumentException("unsupported_action: " + action);
                }
            }
            finally
            {
                if (shouldRestore) InputArm.RestoreCursor(savedCx, savedCy);
            }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["executed"] = true;
            res["action"] = action;
            res["mode"] = mode;
            return res;
        }

        private static List<int[]> ParseDragPoints(Dictionary<string, object> p)
        {
            List<object> ptsObj = JsonMini.GetList(p, "points");
            List<int[]> pts = new List<int[]>();
            if (ptsObj != null && ptsObj.Count >= 2)
            {
                for (int i = 0; i < ptsObj.Count; i++)
                {
                    List<object> pair = ptsObj[i] as List<object>;
                    if (pair != null && pair.Count >= 2)
                    {
                        pts.Add(new int[] { Convert.ToInt32(pair[0]), Convert.ToInt32(pair[1]) });
                    }
                }
            }
            else
            {
                List<object> from = JsonMini.GetList(p, "from");
                List<object> to = JsonMini.GetList(p, "to");
                if (from != null && to != null && from.Count >= 2 && to.Count >= 2)
                {
                    pts.Add(new int[] { Convert.ToInt32(from[0]), Convert.ToInt32(from[1]) });
                    pts.Add(new int[] { Convert.ToInt32(to[0]), Convert.ToInt32(to[1]) });
                }
            }
            return pts;
        }

        private static Dictionary<string, object> HandleParallel(Dictionary<string, object> p)
        {
            if (InputArm.IsEmergencyStopped)
                throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

            string mode = JsonMini.GetString(p, "mode", "virtual").ToLowerInvariant();
            bool showArrows = JsonMini.GetBool(p, "show_arrows", true);
            List<object> lanesRaw = JsonMini.GetList(p, "lanes");
            if (lanesRaw == null || lanesRaw.Count == 0) throw new ArgumentException("invalid_argument: lanes must be non-empty");
            if (lanesRaw.Count > 8) throw new ArgumentException("invalid_argument: max 8 parallel lanes supported");

            // Check if pure touch multi-drag mode is requested and feasible
            if (mode == "touch")
            {
                bool allSingleDrag = true;
                List<List<int[]>> tracks = new List<List<int[]>>();
                int steps = 8;
                for (int i = 0; i < lanesRaw.Count; i++)
                {
                    Dictionary<string, object> lane = lanesRaw[i] as Dictionary<string, object>;
                    List<object> stepsList = JsonMini.GetList(lane, "steps");
                    if (stepsList == null || stepsList.Count != 1) { allSingleDrag = false; break; }
                    Dictionary<string, object> st = stepsList[0] as Dictionary<string, object>;
                    if (JsonMini.GetString(st, "action", "") != "drag") { allSingleDrag = false; break; }
                    List<int[]> pts = ParseDragPoints(st);
                    if (pts.Count < 2) { allSingleDrag = false; break; }
                    steps = Math.Max(steps, JsonMini.GetInt(st, "steps", 4));
                    tracks.Add(pts);
                }

                if (allSingleDrag && VirtualPointer.IsTouchAvailable())
                {
                    VirtualPointer.MultiTouchDrag(tracks, steps, showArrows);
                    List<object> touchResults = new List<object>();
                    for (int i = 0; i < lanesRaw.Count; i++)
                    {
                        Dictionary<string, object> lane = lanesRaw[i] as Dictionary<string, object>;
                        Dictionary<string, object> lr = new Dictionary<string, object>(StringComparer.Ordinal);
                        lr["id"] = JsonMini.GetString(lane, "id", "lane_" + (i + 1));
                        lr["ok"] = true;
                        lr["completed_steps"] = 1;
                        touchResults.Add(lr);
                    }
                    Dictionary<string, object> tRes = new Dictionary<string, object>(StringComparer.Ordinal);
                    tRes["mode"] = "touch";
                    tRes["lanes"] = touchResults;
                    return tRes;
                }
                // Fallback gracefully to virtual if touch unavailable or mixed actions
                mode = "virtual";
            }

            Dictionary<string, object>[] laneResults = new Dictionary<string, object>[lanesRaw.Count];
            Thread[] threads = new Thread[lanesRaw.Count];

            for (int i = 0; i < lanesRaw.Count; i++)
            {
                int laneIndex = i;
                Dictionary<string, object> lane = lanesRaw[i] as Dictionary<string, object>;
                string laneId = JsonMini.GetString(lane, "id", "lane_" + (i + 1));
                long laneHwnd = JsonMini.GetLong(lane, "hwnd", 0);
                List<object> stepsList = JsonMini.GetList(lane, "steps") ?? new List<object>();

                threads[i] = new Thread(delegate()
                {
                    Dictionary<string, object> lr = new Dictionary<string, object>(StringComparer.Ordinal);
                    lr["id"] = laneId;
                    int done = 0;
                    try
                    {
                        for (int s = 0; s < stepsList.Count; s++)
                        {
                            if (InputArm.IsEmergencyStopped)
                                throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                            Dictionary<string, object> st = stepsList[s] as Dictionary<string, object>;
                            if (st == null) continue;
                            string sa = JsonMini.GetString(st, "action", "");
                            if (sa == "sleep")
                            {
                                Thread.Sleep(Math.Min(JsonMini.GetInt(st, "ms", 100), 5000));
                            }
                            else
                            {
                                Dictionary<string, object> execP = new Dictionary<string, object>(st, StringComparer.Ordinal);
                                if (!execP.ContainsKey("hwnd") && laneHwnd != 0) execP["hwnd"] = laneHwnd;
                                execP["mode"] = "virtual";
                                execP["show_arrows"] = showArrows;
                                ExecuteActInternal(execP, laneIndex + 1);
                            }
                            done++;
                        }
                        lr["ok"] = true;
                        lr["completed_steps"] = done;
                    }
                    catch (Exception ex)
                    {
                        lr["ok"] = false;
                        lr["completed_steps"] = done;
                        lr["error"] = ex.Message;
                    }
                    laneResults[laneIndex] = lr;
                });
                threads[i].IsBackground = true;
                threads[i].Start();
            }

            for (int i = 0; i < threads.Length; i++) threads[i].Join();

            List<object> outLanes = new List<object>(laneResults);
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["mode"] = mode;
            res["lanes"] = outLanes;
            return res;
        }

        private static Dictionary<string, object> HandleStop(Dictionary<string, object> p)
        {
            string act = JsonMini.GetString(p, "action", "stop");
            int released = 0;
            if (act == "reset")
            {
                released = InputArm.ReleaseAll();
                InputArm.SetEmergencyStopped(false);
            }
            else if (act == "release_inputs")
            {
                released = InputArm.ReleaseAll();
            }
            else
            {
                InputArm.SetEmergencyStopped(true);
                released = InputArm.ReleaseAll();
            }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["emergency_stopped"] = InputArm.IsEmergencyStopped;
            res["released_inputs"] = released;
            return res;
        }

        private static void FocusWindow(IntPtr hwnd)
        {
            if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }

        private static Bitmap CaptureWindowBitmap(IntPtr hwnd, int left, int top, int width, int height)
        {
            RECT raw = new RECT();
            raw.Left = left; raw.Top = top; raw.Right = left + width; raw.Bottom = top + height;
            return CaptureVisibleWindowBitmap(hwnd, raw, raw);
        }

        private static Bitmap CaptureVisibleWindowBitmap(IntPtr hwnd, RECT rawRect, RECT visRect)
        {
            int rawW = Math.Max(1, rawRect.Right - rawRect.Left);
            int rawH = Math.Max(1, rawRect.Bottom - rawRect.Top);
            int visW = Math.Max(1, visRect.Right - visRect.Left);
            int visH = Math.Max(1, visRect.Bottom - visRect.Top);

            Bitmap rawBmp = new Bitmap(rawW, rawH, PixelFormat.Format32bppArgb);
            bool ok = false;
            using (Graphics g = Graphics.FromImage(rawBmp))
            {
                IntPtr hdc = g.GetHdc();
                try
                {
                    ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
                    if (!ok) ok = PrintWindow(hwnd, hdc, 0);
                }
                finally
                {
                    g.ReleaseHdc(hdc);
                }
            }

            if (!ok)
            {
                rawBmp.Dispose();
                return CaptureScreenRect(visRect.Left, visRect.Top, visW, visH);
            }

            int offX = visRect.Left - rawRect.Left;
            int offY = visRect.Top - rawRect.Top;
            if (offX == 0 && offY == 0 && visW == rawW && visH == rawH)
            {
                return rawBmp;
            }

            int srcX = Math.Max(0, Math.Min(rawW - 1, offX));
            int srcY = Math.Max(0, Math.Min(rawH - 1, offY));
            int copyW = Math.Max(1, Math.Min(visW, rawW - srcX));
            int copyH = Math.Max(1, Math.Min(visH, rawH - srcY));
            Bitmap cropped = new Bitmap(copyW, copyH, PixelFormat.Format32bppArgb);
            using (Graphics g2 = Graphics.FromImage(cropped))
            {
                g2.DrawImage(rawBmp, new Rectangle(0, 0, copyW, copyH), new Rectangle(srcX, srcY, copyW, copyH), GraphicsUnit.Pixel);
            }
            rawBmp.Dispose();
            return cropped;
        }

        private static bool GetVisibleWindowRect(IntPtr hwnd, out RECT rect)
        {
            try
            {
                if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf(typeof(RECT))) == 0)
                {
                    if (rect.Right > rect.Left && rect.Bottom > rect.Top) return true;
                }
            }
            catch { }
            return GetWindowRect(hwnd, out rect);
        }

        private static bool GetClientBounds(IntPtr hwnd, out RECT screenClient)
        {
            screenClient = new RECT();
            RECT cr;
            if (!GetClientRect(hwnd, out cr)) return false;
            POINT tl = new POINT();
            tl.X = cr.Left; tl.Y = cr.Top;
            if (!ClientToScreen(hwnd, ref tl)) return false;
            screenClient.Left = tl.X;
            screenClient.Top = tl.Y;
            screenClient.Right = tl.X + (cr.Right - cr.Left);
            screenClient.Bottom = tl.Y + (cr.Bottom - cr.Top);
            return true;
        }

        private static Bitmap CaptureScreenRect(int left, int top, int width, int height)
        {
            Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(left, top, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
            }
            return bmp;
        }

        private static Bitmap ScaleBitmapIfNeeded(Bitmap src, int maxWidth)
        {
            if (maxWidth <= 0 || src.Width <= maxWidth)
            {
                return new Bitmap(src);
            }
            int nw = maxWidth;
            int nh = Math.Max(1, (int)Math.Round(src.Height * ((double)nw / src.Width)));
            Bitmap dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            using (Graphics g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(src, 0, 0, nw, nh);
            }
            return dst;
        }

        private static ImageCodecInfo GetJpegCodec()
        {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageEncoders();
            for (int i = 0; i < codecs.Length; i++)
            {
                if (codecs[i].MimeType == "image/jpeg") return codecs[i];
            }
            return null;
        }

        private static string EncodeJpegBase64(Bitmap bmp, long quality)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                SaveJpegToStream(bmp, ms, quality);
                return Convert.ToBase64String(ms.ToArray());
            }
        }

        private static void SaveJpeg(Bitmap bmp, string filePath, long quality)
        {
            using (FileStream fs = new FileStream(filePath, FileMode.Create, FileAccess.Write))
            {
                SaveJpegToStream(bmp, fs, quality);
            }
        }

        private static void SaveJpegToStream(Bitmap bmp, Stream stream, long quality)
        {
            ImageCodecInfo codec = GetJpegCodec();
            if (codec == null)
            {
                bmp.Save(stream, ImageFormat.Png);
                return;
            }
            using (EncoderParameters ep = new EncoderParameters(1))
            {
                ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                bmp.Save(stream, codec, ep);
            }
        }

        private static Dictionary<string, object> BoundsDict(int x, int y, int w, int h)
        {
            Dictionary<string, object> b = new Dictionary<string, object>(StringComparer.Ordinal);
            b["x"] = x; b["y"] = y; b["w"] = w; b["h"] = h;
            return b;
        }

        private static List<object> GetMonitors()
        {
            List<object> monitors = new List<object>();
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr hMon, IntPtr hdc, ref RECT lprc, IntPtr data)
            {
                MONITORINFOEX mi = new MONITORINFOEX();
                mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
                if (GetMonitorInfo(hMon, ref mi))
                {
                    uint dx = 96, dy = 96;
                    try { GetDpiForMonitor(hMon, 0, out dx, out dy); } catch { dx = 96; dy = 96; }
                    if (dx == 0) dx = 96;
                    Dictionary<string, object> m = new Dictionary<string, object>(StringComparer.Ordinal);
                    m["device"] = mi.szDevice ?? "DISPLAY";
                    m["primary"] = (mi.dwFlags & 1) != 0;
                    m["dpi"] = (int)dx;
                    m["scale"] = Math.Round(dx / 96.0, 2);
                    m["bounds"] = new List<object> { mi.rcMonitor.Left, mi.rcMonitor.Top, mi.rcMonitor.Right - mi.rcMonitor.Left, mi.rcMonitor.Bottom - mi.rcMonitor.Top };
                    m["work_area"] = new List<object> { mi.rcWork.Left, mi.rcWork.Top, mi.rcWork.Right - mi.rcWork.Left, mi.rcWork.Bottom - mi.rcWork.Top };
                    monitors.Add(m);
                }
                return true;
            }, IntPtr.Zero);
            return monitors;
        }

        private static void EnableDpiAwareness()
        {
            try
            {
                SetProcessDpiAwarenessContext(new IntPtr(-4)); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
            }
            catch
            {
                try { SetProcessDPIAware(); } catch { }
            }
        }

        private static string GetCurrentDesktopName()
        {
            try
            {
                IntPtr hd = GetThreadDesktop(GetCurrentThreadId());
                if (hd == IntPtr.Zero) return "";
                StringBuilder sb = new StringBuilder(256);
                int needed = 0;
                if (GetUserObjectInformation(hd, 2, sb, sb.Capacity, out needed)) return sb.ToString();
            }
            catch { }
            return "";
        }

        private static string GetWindowTitle(IntPtr hwnd)
        {
            int len = GetWindowTextLength(hwnd);
            if (len <= 0) return "";
            StringBuilder sb = new StringBuilder(len + 1);
            GetWindowText(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        private static string GetProcessName(uint pid)
        {
            IntPtr hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (hProc != IntPtr.Zero)
            {
                try
                {
                    StringBuilder sb = new StringBuilder(512);
                    int size = sb.Capacity;
                    if (QueryFullProcessImageName(hProc, 0, sb, ref size))
                    {
                        return Path.GetFileName(sb.ToString());
                    }
                }
                finally { CloseHandle(hProc); }
            }
            try { return Process.GetProcessById((int)pid).ProcessName + ".exe"; } catch { return ""; }
        }

        private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
        private const uint PW_RENDERFULLCONTENT = 0x00000002;
        private const int SW_RESTORE = 9;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOZORDER = 0x0004;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
        private delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct MONITORINFOEX
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szDevice;
        }

        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
        [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
        [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
        [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);
        [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
        [DllImport("shcore.dll")] private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);
        [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr hObject);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref int lpdwSize);
        [DllImport("kernel32.dll")] private static extern int GetCurrentThreadId();
        [DllImport("user32.dll")] private static extern IntPtr GetThreadDesktop(int dwThreadId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);
    }
}
