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
                RegionLockOverlay.Unlock();
                InputArm.ClearInputLock();
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

            RegionLockOverlay.Unlock();
            InputArm.ClearInputLock();
            InputArm.ReleaseAll();
            InputArm.StopEmergencyHook();
            return 0;
        }

        private static readonly object UiaHashLock = new object();
        private static readonly Dictionary<long, string> LastUiaHashByHwnd = new Dictionary<long, string>();
        private static readonly object CapLock = new object();
        private static readonly Dictionary<long, string> CapabilityByHwnd = new Dictionary<long, string>();

        private static string GetCachedCapability(long hwndVal)
        {
            if (hwndVal == 0) return null;
            lock (CapLock)
            {
                string val;
                return CapabilityByHwnd.TryGetValue(hwndVal, out val) ? val : null;
            }
        }

        private static void SetCachedCapability(long hwndVal, string resolved)
        {
            if (hwndVal == 0 || string.IsNullOrEmpty(resolved)) return;
            lock (CapLock)
            {
                CapabilityByHwnd[hwndVal] = resolved;
            }
        }

        private static object Dispatch(string cmd, Dictionary<string, object> p)
        {
            if (cmd == "ping" || cmd == "status") return HandleStatus();
            if (cmd == "windows") return HandleWindows(p);
            if (cmd == "window_info") return HandleWindowInfo(p);
            if (cmd == "launch") return HandleLaunch(p);
            if (cmd == "observe") return HandleObserve(p);
            if (cmd == "ocr") return HandleOcr(p);
            if (cmd == "match_template") return HandleMatchTemplate(p);
            if (cmd == "sample_pixels") return HandleSamplePixels(p);
            if (cmd == "find_color_bounds") return HandleFindColorBounds(p);
            if (cmd == "vectorize_image") return HandleVectorizeImage(p);
            if (cmd == "compare_reference") return HandleCompareReference(p);
            if (cmd == "extract_table") return HandleExtractTable(p);
            if (cmd == "clipboard_get") return HandleClipboardGet(p);
            if (cmd == "clipboard_set") return HandleClipboardSet(p);
            if (cmd == "act") return HandleAct(p);
            if (cmd == "plan_batch") return HandlePlanBatch(p);
            if (cmd == "parallel") return HandleParallel(p);
            if (cmd == "lock") return HandleLock(p);
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
            res["pen_injection_available"] = VirtualPointer.IsPenAvailable();
            res["cursor_pos"] = new List<object> { cx, cy };
            res["winrt_ocr_available"] = VisionMath.IsWinRtOcrAvailable();
            res["ocr_languages"] = VisionMath.GetOcrLanguages();
            res["region_lock"] = RegionLockOverlay.GetState();
            res["monitors"] = GetMonitors();
            return res;
        }

        private static Rectangle ResolveLockRect(Dictionary<string, object> p, string key, IntPtr hwnd)
        {
            object rawObj = null;
            if (p != null)
            {
                if (p.ContainsKey(key)) rawObj = p[key];
                else if (key != "lock_region" && p.ContainsKey("lock_region")) rawObj = p["lock_region"];
            }
            if (rawObj == null) return Rectangle.Empty;

            string spec = rawObj as string;
            if (spec != null)
            {
                string s = spec.ToLowerInvariant().Trim();
                if (s == "none" || s == "off" || s == "") return Rectangle.Empty;
                if (s == "roi" && p.ContainsKey("roi"))
                {
                    List<object> roiList = p["roi"] as List<object>;
                    if (roiList != null && roiList.Count == 4)
                    {
                        int rx = Convert.ToInt32(roiList[0]);
                        int ry = Convert.ToInt32(roiList[1]);
                        int rw = Convert.ToInt32(roiList[2]);
                        int rh = Convert.ToInt32(roiList[3]);
                        if (rw > 0 && rh > 0) return new Rectangle(rx, ry, rw, rh);
                    }
                }
                if ((s == "window" || s == "roi") && hwnd != IntPtr.Zero && IsWindow(hwnd))
                {
                    RECT vr;
                    if (GetVisibleWindowRect(hwnd, out vr))
                    {
                        int w = Math.Max(0, vr.Right - vr.Left);
                        int h = Math.Max(0, vr.Bottom - vr.Top);
                        if (w > 0 && h > 0) return new Rectangle(vr.Left, vr.Top, w, h);
                    }
                }
                return Rectangle.Empty;
            }

            List<object> arr = rawObj as List<object>;
            if (arr != null && arr.Count == 4)
            {
                int ax = Convert.ToInt32(arr[0]);
                int ay = Convert.ToInt32(arr[1]);
                int aw = Convert.ToInt32(arr[2]);
                int ah = Convert.ToInt32(arr[3]);
                if (aw > 0 && ah > 0) return new Rectangle(ax, ay, aw, ah);
            }
            return Rectangle.Empty;
        }

        private static Dictionary<string, object> HandleLock(Dictionary<string, object> p)
        {
            string act = JsonMini.GetString(p, "action", "lock").ToLowerInvariant();
            bool activeFlag = JsonMini.GetBool(p, "active", true);
            if (act == "unlock" || !activeFlag)
            {
                RegionLockOverlay.Unlock();
                return RegionLockOverlay.GetState();
            }
            string statusText = JsonMini.GetString(p, "status_text", "");
            if (act == "status_text")
            {
                RegionLockOverlay.SetStatusText(statusText);
                return RegionLockOverlay.GetState();
            }

            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            string policy = JsonMini.GetString(p, "policy", JsonMini.GetString(p, "lock_policy", "soft"));
            int ttlMs = JsonMini.GetInt(p, "ttl_ms", 30000);
            bool defaultFollow = p.ContainsKey("region") && string.Equals(Convert.ToString(p["region"]), "window", StringComparison.OrdinalIgnoreCase);
            bool followWin = JsonMini.GetBool(p, "follow_window", defaultFollow);

            Rectangle rect = ResolveLockRect(p, "region", hwnd);
            if (rect.IsEmpty && hwnd != IntPtr.Zero && IsWindow(hwnd))
            {
                RECT vr;
                if (GetVisibleWindowRect(hwnd, out vr))
                {
                    rect = new Rectangle(vr.Left, vr.Top, Math.Max(0, vr.Right - vr.Left), Math.Max(0, vr.Bottom - vr.Top));
                }
            }
            if (rect.Width <= 0 || rect.Height <= 0)
                throw new ArgumentException("invalid_argument: lock requires valid hwnd window or [x, y, w, h] region");

            RegionLockOverlay.Lock(rect, hwnd, policy, ttlMs, followWin, statusText);
            return RegionLockOverlay.GetState();
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
            bool autoGate = JsonMini.GetBool(p, "auto_gate", false);
            bool withOcr = JsonMini.GetBool(p, "with_ocr", false);
            string withUia = JsonMini.GetString(p, "with_uia", "full").ToLowerInvariant();
            int maxWidth = JsonMini.GetInt(p, "max_width", 1280);
            int settleMs = JsonMini.GetInt(p, "settle_ms", 0);
            string ocrLang = JsonMini.GetString(p, "language", "");
            string savePath = JsonMini.GetString(p, "save_path", "");
            List<object> roiList = JsonMini.GetList(p, "roi");

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

            List<object> nodes = new List<object>();
            bool uiaSkipped = false;
            bool uiaUnchanged = false;
            string uiaHash = null;
            int nodeCountForGate = 0;

            if (withUia == "off" || withUia == "false" || withUia == "none")
            {
                uiaSkipped = true;
            }
            else
            {
                nodes = UiaTree.SnapshotWindow(hwnd, maxNodes, query, onlyInteractive);
                nodeCountForGate = nodes.Count;
                uiaHash = UiaTree.ComputeTreeHash(nodes);
                if (withUia == "diff")
                {
                    string prevUia = null;
                    lock (UiaHashLock)
                    {
                        LastUiaHashByHwnd.TryGetValue(hwnd.ToInt64(), out prevUia);
                        LastUiaHashByHwnd[hwnd.ToInt64()] = uiaHash;
                    }
                    if (prevUia != null && prevUia == uiaHash)
                    {
                        uiaUnchanged = true;
                        nodes = new List<object>();
                    }
                }
                else
                {
                    lock (UiaHashLock) { LastUiaHashByHwnd[hwnd.ToInt64()] = uiaHash; }
                }
            }

            string dhashHex = "0000000000000000";
            string imageB64 = null;
            string imageMime = null;
            int capOriginX = visRect.Left;
            int capOriginY = visRect.Top;
            int capW = winW;
            int capH = winH;
            string roiKey = "";
            List<object> roiOut = null;

            bool hasRoi = (roiList != null && roiList.Count == 4);
            if (hasRoi)
            {
                capOriginX = Convert.ToInt32(roiList[0]);
                capOriginY = Convert.ToInt32(roiList[1]);
                capW = Math.Max(1, Convert.ToInt32(roiList[2]));
                capH = Math.Max(1, Convert.ToInt32(roiList[3]));
                roiKey = string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0},{1},{2},{3}", capOriginX, capOriginY, capW, capH);
                roiOut = new List<object> { capOriginX, capOriginY, capW, capH };
            }

            int imgW = capW;
            int imgH = capH;
            bool imageSuppressed = false;
            bool visualChanged = true;
            int dhashDistance = 64;
            double changedPct = 0.0;
            object dirtyRect = null;
            Dictionary<string, object> ocrResult = null;

            using (Bitmap targetBmp = CaptureTargetBitmap(hwnd, rawRect, visRect, hasRoi, capOriginX, capOriginY, capW, capH))
            {
                if (targetBmp != null)
                {
                    Dictionary<string, object> diff = VisionMath.ComputeFrameDiff(hwnd.ToInt64(), roiKey, targetBmp, capOriginX, capOriginY);
                    dhashHex = JsonMini.GetString(diff, "dhash", "0000000000000000");
                    dhashDistance = JsonMini.GetInt(diff, "dhash_distance", 64);
                    changedPct = JsonMini.GetDouble(diff, "changed_pixels_pct", 0.0);
                    dirtyRect = diff.ContainsKey("dirty_rect") ? diff["dirty_rect"] : null;
                    visualChanged = JsonMini.GetBool(diff, "visual_changed", true);

                    if (withOcr)
                    {
                        ocrResult = VisionMath.RunWinRtOcr(targetBmp, ocrLang, capOriginX, capOriginY);
                    }

                    bool suppressNow = autoGate && withImage && string.IsNullOrEmpty(savePath) && !visualChanged && (uiaSkipped || nodeCountForGate >= 5);
                    if (suppressNow)
                    {
                        imageSuppressed = true;
                    }
                    else if (withImage || !string.IsNullOrEmpty(savePath))
                    {
                        using (Bitmap scaled = ScaleBitmapIfNeeded(targetBmp, maxWidth))
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
            imgSize["w"] = (withImage && !imageSuppressed) ? imgW : capW;
            imgSize["h"] = (withImage && !imageSuppressed) ? imgH : capH;

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["hwnd"] = hwnd.ToInt64();
            res["pid"] = (long)pid;
            res["process"] = proc;
            res["title"] = title;
            res["bounds"] = BoundsDict(visRect.Left, visRect.Top, winW, winH);
            res["raw_bounds"] = BoundsDict(rawRect.Left, rawRect.Top, Math.Max(1, rawRect.Right - rawRect.Left), Math.Max(1, rawRect.Bottom - rawRect.Top));
            if (hasClient) res["client_bounds"] = BoundsDict(clientRect.Left, clientRect.Top, Math.Max(0, clientRect.Right - clientRect.Left), Math.Max(0, clientRect.Bottom - clientRect.Top));
            if (roiOut != null) res["roi"] = roiOut;
            res["image_size"] = imgSize;
            res["dhash"] = dhashHex;
            res["dhash_distance"] = dhashDistance;
            res["changed_pixels_pct"] = changedPct;
            res["dirty_rect"] = dirtyRect;
            res["visual_changed"] = visualChanged;
            res["image_suppressed"] = imageSuppressed;
            res["nodes"] = nodes;
            if (uiaHash != null) res["uia_hash"] = uiaHash;
            if (uiaUnchanged) res["uia_unchanged"] = true;
            if (uiaSkipped) res["uia_skipped"] = true;
            if (ocrResult != null) res["ocr"] = ocrResult;
            if (imageB64 != null)
            {
                res["image_base64"] = imageB64;
                res["image_mime"] = imageMime;
            }
            return res;
        }

        private static Bitmap CaptureTargetBitmap(IntPtr hwnd, RECT rawRect, RECT visRect, bool hasRoi, int roiX, int roiY, int roiW, int roiH)
        {
            if (!hasRoi) return CaptureVisibleWindowBitmap(hwnd, rawRect, visRect);

            bool insideVis = roiX >= visRect.Left && roiY >= visRect.Top &&
                             (roiX + roiW) <= visRect.Right && (roiY + roiH) <= visRect.Bottom;
            if (insideVis)
            {
                using (Bitmap full = CaptureVisibleWindowBitmap(hwnd, rawRect, visRect))
                {
                    if (full != null)
                    {
                        int lx = Math.Max(0, Math.Min(full.Width - 1, roiX - visRect.Left));
                        int ly = Math.Max(0, Math.Min(full.Height - 1, roiY - visRect.Top));
                        int cw = Math.Max(1, Math.Min(roiW, full.Width - lx));
                        int ch = Math.Max(1, Math.Min(roiH, full.Height - ly));
                        Bitmap crop = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);
                        using (Graphics g = Graphics.FromImage(crop))
                        {
                            g.DrawImage(full, new Rectangle(0, 0, cw, ch), new Rectangle(lx, ly, cw, ch), GraphicsUnit.Pixel);
                        }
                        return crop;
                    }
                }
            }
            return CaptureScreenRect(roiX, roiY, roiW, roiH);
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
            int maxMatches = JsonMini.GetInt(p, "max_matches", 1);
            List<object> roi = JsonMini.GetList(p, "roi");
            List<object> scalesRaw = JsonMini.GetList(p, "scales");
            if (string.IsNullOrEmpty(tplPath) || !File.Exists(tplPath))
                throw new ArgumentException("invalid_argument: template_path does not exist");

            double[] scales = null;
            if (scalesRaw != null && scalesRaw.Count > 0)
            {
                scales = new double[scalesRaw.Count];
                for (int i = 0; i < scalesRaw.Count; i++)
                    scales[i] = Convert.ToDouble(scalesRaw[i], System.Globalization.CultureInfo.InvariantCulture);
            }

            RECT visRect;
            if (!GetVisibleWindowRect(hwnd, out visRect)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            RECT rawRect;
            if (!GetWindowRect(hwnd, out rawRect)) rawRect = visRect;

            bool hasRoi = (roi != null && roi.Count == 4);
            int ox = hasRoi ? Convert.ToInt32(roi[0]) : visRect.Left;
            int oy = hasRoi ? Convert.ToInt32(roi[1]) : visRect.Top;
            int ow = hasRoi ? Math.Max(1, Convert.ToInt32(roi[2])) : Math.Max(1, visRect.Right - visRect.Left);
            int oh = hasRoi ? Math.Max(1, Convert.ToInt32(roi[3])) : Math.Max(1, visRect.Bottom - visRect.Top);

            using (Bitmap screen = CaptureTargetBitmap(hwnd, rawRect, visRect, hasRoi, ox, oy, ow, oh))
            using (Bitmap tpl = new Bitmap(tplPath))
            {
                return VisionMath.FindTemplateMulti(screen, tpl, minScore, ox, oy, scales, maxMatches);
            }
        }

        private static Dictionary<string, object> HandleSamplePixels(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Window not found");

            List<object> ptsObj = JsonMini.GetList(p, "points") ?? new List<object>();
            List<int[]> pts = new List<int[]>();
            for (int i = 0; i < ptsObj.Count; i++)
            {
                List<object> pair = ptsObj[i] as List<object>;
                if (pair != null && pair.Count >= 2)
                    pts.Add(new int[] { Convert.ToInt32(pair[0]), Convert.ToInt32(pair[1]) });
            }

            RECT visRect;
            if (!GetVisibleWindowRect(hwnd, out visRect)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            RECT rawRect;
            if (!GetWindowRect(hwnd, out rawRect)) rawRect = visRect;

            using (Bitmap bmp = CaptureVisibleWindowBitmap(hwnd, rawRect, visRect))
            {
                Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
                res["hwnd"] = hwnd.ToInt64();
                res["pixels"] = VisionMath.SamplePixels(bmp, visRect.Left, visRect.Top, pts);
                return res;
            }
        }

        private static Dictionary<string, object> HandleFindColorBounds(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Window not found");

            List<object> rgb = JsonMini.GetList(p, "target_rgb");
            if (rgb == null || rgb.Count < 3) throw new ArgumentException("invalid_argument: target_rgb [r,g,b] is required");
            int tr = Convert.ToInt32(rgb[0]);
            int tg = Convert.ToInt32(rgb[1]);
            int tb = Convert.ToInt32(rgb[2]);
            int tol = JsonMini.GetInt(p, "tolerance", 12);
            bool invert = JsonMini.GetBool(p, "invert", false);
            List<object> roi = JsonMini.GetList(p, "roi");

            RECT visRect;
            if (!GetVisibleWindowRect(hwnd, out visRect)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            RECT rawRect;
            if (!GetWindowRect(hwnd, out rawRect)) rawRect = visRect;

            bool hasRoi = (roi != null && roi.Count == 4);
            int ox = hasRoi ? Convert.ToInt32(roi[0]) : visRect.Left;
            int oy = hasRoi ? Convert.ToInt32(roi[1]) : visRect.Top;
            int ow = hasRoi ? Math.Max(1, Convert.ToInt32(roi[2])) : Math.Max(1, visRect.Right - visRect.Left);
            int oh = hasRoi ? Math.Max(1, Convert.ToInt32(roi[3])) : Math.Max(1, visRect.Bottom - visRect.Top);

            using (Bitmap bmp = CaptureTargetBitmap(hwnd, rawRect, visRect, hasRoi, ox, oy, ow, oh))
            {
                return VisionMath.FindColorBounds(bmp, ox, oy, tr, tg, tb, tol, invert);
            }
        }

        private static Dictionary<string, object> HandleVectorizeImage(Dictionary<string, object> p)
        {
            string imgPath = JsonMini.GetString(p, "image_path", "");
            List<object> rect = JsonMini.GetList(p, "canvas_rect");
            if (rect == null || rect.Count < 4) throw new ArgumentException("invalid_argument: canvas_rect [x,y,w,h] is required");
            int cx = Convert.ToInt32(rect[0]);
            int cy = Convert.ToInt32(rect[1]);
            int cw = Convert.ToInt32(rect[2]);
            int ch = Convert.ToInt32(rect[3]);
            int palSize = JsonMini.GetInt(p, "palette_size", 9);
            int maxStrokes = JsonMini.GetInt(p, "max_strokes", 320);
            return VisionMath.VectorizeImage(imgPath, cx, cy, cw, ch, palSize, maxStrokes);
        }

        private static Dictionary<string, object> HandleCompareReference(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Window not found");

            string imgPath = JsonMini.GetString(p, "image_path", "");
            List<object> roi = JsonMini.GetList(p, "roi");
            int cols = JsonMini.GetInt(p, "grid_cols", 6);
            int rows = JsonMini.GetInt(p, "grid_rows", 4);
            int topN = JsonMini.GetInt(p, "top_n", 6);

            RECT visRect;
            if (!GetVisibleWindowRect(hwnd, out visRect)) throw new InvalidOperationException("window_not_found: Cannot read window rect");
            RECT rawRect;
            if (!GetWindowRect(hwnd, out rawRect)) rawRect = visRect;

            bool hasRoi = (roi != null && roi.Count == 4);
            int ox = hasRoi ? Convert.ToInt32(roi[0]) : visRect.Left;
            int oy = hasRoi ? Convert.ToInt32(roi[1]) : visRect.Top;
            int ow = hasRoi ? Math.Max(1, Convert.ToInt32(roi[2])) : Math.Max(1, visRect.Right - visRect.Left);
            int oh = hasRoi ? Math.Max(1, Convert.ToInt32(roi[3])) : Math.Max(1, visRect.Bottom - visRect.Top);

            using (Bitmap bmp = CaptureTargetBitmap(hwnd, rawRect, visRect, hasRoi, ox, oy, ow, oh))
            {
                return VisionMath.CompareWithReference(bmp, imgPath, ox, oy, cols, rows, topN);
            }
        }

        private static Dictionary<string, object> HandleExtractTable(Dictionary<string, object> p)
        {
            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            if (hwnd == IntPtr.Zero) hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
                throw new InvalidOperationException("window_not_found: Invalid hwnd");

            int index = JsonMini.GetInt(p, "index", -1);
            int maxRows = JsonMini.GetInt(p, "max_rows", 100);
            int maxCols = JsonMini.GetInt(p, "max_cols", 32);
            return UiaTree.ExtractTable(hwnd, index, maxRows, maxCols);
        }

        private static Dictionary<string, object> HandleClipboardGet(Dictionary<string, object> p)
        {
            string savePath = JsonMini.GetString(p, "save_image_path", "");
            return InputArm.ClipboardGet(savePath);
        }

        private static Dictionary<string, object> HandleClipboardSet(Dictionary<string, object> p)
        {
            string kind = JsonMini.GetString(p, "kind", JsonMini.GetString(p, "clipboard_kind", "text"));
            string text = JsonMini.GetString(p, "text", "");
            string imagePath = JsonMini.GetString(p, "image_path", "");
            List<string> files = new List<string>();
            List<object> rawFiles = JsonMini.GetList(p, "files");
            if (rawFiles != null)
            {
                for (int i = 0; i < rawFiles.Count; i++)
                {
                    if (rawFiles[i] != null) files.Add(Convert.ToString(rawFiles[i]));
                }
            }
            return InputArm.ClipboardSet(kind, text, imagePath, files);
        }

        private static Dictionary<string, object> HandleAct(Dictionary<string, object> p)
        {
            return ExecuteActInternal(p, 1, true);
        }

        private static Dictionary<string, object> ExecuteActInternal(Dictionary<string, object> p, int arrowId)
        {
            return ExecuteActInternal(p, arrowId, true);
        }

        private static bool IsProbeableAutoAction(string action)
        {
            return action == "click" || action == "double_click" || action == "right_click" ||
                   action == "drag" || action == "modifier_drag" || action == "batch_strokes" || action == "scroll" ||
                   action == "type" || action == "clear_and_type" || action == "set_value";
        }

        private static bool ExecuteSingleAction(
            Dictionary<string, object> p,
            IntPtr hwnd,
            string action,
            string execMode,
            int arrowId,
            bool showArrows,
            string speed,
            int pxPerStep,
            int pressure,
            int x,
            int y,
            int index,
            bool physical,
            bool manageFocus)
        {
            string modifiers = JsonMini.GetString(p, "modifiers", "");
            bool isPointerOp = (action == "click" || action == "double_click" || action == "right_click" ||
                                action == "drag" || action == "modifier_drag" || action == "batch_strokes" || action == "scroll");
            if (!string.IsNullOrEmpty(modifiers) && isPointerOp)
            {
                bool modRes = false;
                InputArm.WithModifiers(modifiers, delegate()
                {
                    modRes = ExecuteSingleActionCore(p, hwnd, action, execMode, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocus);
                });
                return modRes;
            }
            return ExecuteSingleActionCore(p, hwnd, action, execMode, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocus);
        }

        private static bool ExecuteSingleActionCore(
            Dictionary<string, object> p,
            IntPtr hwnd,
            string action,
            string execMode,
            int arrowId,
            bool showArrows,
            string speed,
            int pxPerStep,
            int pressure,
            int x,
            int y,
            int index,
            bool physical,
            bool manageFocus)
        {
            if (manageFocus && (execMode == "physical" || execMode == "pen") && hwnd != IntPtr.Zero && IsWindow(hwnd) && action != "move")
            {
                InputArm.EnsureForeground(hwnd, 120);
            }

            if (action == "focus")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                InputArm.EnsureForeground(hwnd, 150);
                return false;
            }
            if (action == "click" || action == "double_click" || action == "right_click")
            {
                if (!physical && index >= 0 && hwnd != IntPtr.Zero)
                {
                    string uiaErr;
                    if (!UiaTree.TrySemanticAction(hwnd, index, "click", null, out uiaErr))
                        throw new InvalidOperationException("semantic_failed: " + uiaErr);
                    return true;
                }
                string btn = action == "right_click" ? "right" : JsonMini.GetString(p, "button", "left");
                int clicks = action == "double_click" ? 2 : JsonMini.GetInt(p, "clicks", 1);
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
                {
                    VirtualPointer.VirtualClick(hwnd, x, y, btn, clicks, arrowId, showArrows);
                }
                else if (execMode == "pen" && action != "right_click")
                {
                    VirtualPointer.PenClick(x, y, pressure, showArrows);
                }
                else if (execMode == "touch")
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
                return false;
            }
            if (action == "move")
            {
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
                    VirtualPointer.VirtualMove(hwnd, x, y, arrowId, showArrows);
                else
                    InputArm.MoveSmooth(x, y, JsonMini.GetInt(p, "steps", 6), InputArm.ResolveSpeedDelayMs(speed));
                return false;
            }
            if (action == "hover")
            {
                int durMs = JsonMini.GetInt(p, "duration_ms", 400);
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
                {
                    VirtualPointer.VirtualMove(hwnd, x, y, arrowId, showArrows);
                    if (durMs > 0) Thread.Sleep(Math.Min(5000, durMs));
                }
                else
                {
                    InputArm.Hover(x, y, durMs, JsonMini.GetInt(p, "steps", 6), InputArm.ResolveSpeedDelayMs(speed));
                }
                return false;
            }
            if (action == "drag" || action == "modifier_drag")
            {
                List<int[]> pts = ParseDragPoints(p);
                string btn = JsonMini.GetString(p, "button", "left");
                int steps = JsonMini.GetInt(p, "steps", 8);
                int delayMs = InputArm.ResolveSpeedDelayMs(speed);
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
                {
                    VirtualPointer.VirtualDrag(hwnd, pts, btn, steps, arrowId, showArrows, delayMs);
                }
                else if (execMode == "pen")
                {
                    VirtualPointer.PenDrag(pts, steps, pressure, delayMs, showArrows);
                }
                else if (execMode == "touch")
                {
                    List<List<int[]>> tracks = new List<List<int[]>>();
                    tracks.Add(pts);
                    VirtualPointer.MultiTouchDrag(tracks, steps, showArrows);
                }
                else
                {
                    InputArm.Drag(pts, btn, steps, speed, pxPerStep);
                }
                return false;
            }
            if (action == "batch_strokes")
            {
                List<object> strokesObj = JsonMini.GetList(p, "strokes");
                if (strokesObj == null || strokesObj.Count == 0)
                    throw new ArgumentException("invalid_argument: batch_strokes requires non-empty strokes array");
                string btn = JsonMini.GetString(p, "button", "left");
                int steps = JsonMini.GetInt(p, "steps", 6);
                int delayMs = InputArm.ResolveSpeedDelayMs(speed);
                for (int si = 0; si < strokesObj.Count; si++)
                {
                    if (InputArm.IsEmergencyStopped)
                        throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                    List<int[]> sPts = ParseStrokeList(strokesObj[si] as List<object>);
                    if (sPts.Count < 2) continue;
                    if (execMode == "virtual" && hwnd != IntPtr.Zero)
                        VirtualPointer.VirtualDrag(hwnd, sPts, btn, steps, arrowId, showArrows, delayMs);
                    else if (execMode == "pen")
                        VirtualPointer.PenDrag(sPts, steps, pressure, delayMs, showArrows);
                    else
                        InputArm.Drag(sPts, btn, steps, speed, pxPerStep);
                }
                return false;
            }
            if (action == "scroll")
            {
                int amount = JsonMini.GetInt(p, "amount", -3);
                bool horiz = JsonMini.GetBool(p, "horizontal", false);
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
                    VirtualPointer.VirtualScroll(hwnd, x, y, amount, horiz);
                else
                    InputArm.Scroll(x, y, amount, horiz);
                return false;
            }
            if (action == "type")
            {
                string text = JsonMini.GetString(p, "text", "");
                if (execMode == "virtual" && hwnd != IntPtr.Zero)
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
                return false;
            }
            if (action == "clear_and_type" || action == "set_value")
            {
                string valText = JsonMini.GetString(p, "text", "");
                if (index >= 0 && hwnd != IntPtr.Zero)
                {
                    string uiaErr;
                    if (UiaTree.TrySemanticAction(hwnd, index, "set_value", valText, out uiaErr))
                        return true;
                }
                if (p.ContainsKey("x") && p.ContainsKey("y"))
                {
                    if (execMode == "virtual" && hwnd != IntPtr.Zero)
                        VirtualPointer.VirtualClick(hwnd, x, y, "left", 1, arrowId, showArrows);
                    else
                        InputArm.Click(x, y, "left", 1);
                    Thread.Sleep(25);
                }
                InputArm.ClearAndType(valText);
                return false;
            }
            if (action == "paste")
            {
                if (p.ContainsKey("x") && p.ContainsKey("y") && JsonMini.GetBool(p, "click_first", false))
                {
                    InputArm.Click(x, y, "left", 1);
                    Thread.Sleep(25);
                }
                InputArm.PasteText(JsonMini.GetString(p, "text", ""));
                return false;
            }
            if (action == "key")
            {
                InputArm.PressChord(JsonMini.GetString(p, "keys", ""));
                return false;
            }
            if (action == "resize")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                int cw = JsonMini.GetInt(p, "width", 800);
                int ch = JsonMini.GetInt(p, "height", 600);
                SetWindowPos(hwnd, IntPtr.Zero, 0, 0, cw, ch, SWP_NOMOVE | SWP_NOZORDER);
                return false;
            }
            if (action == "minimize")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                ShowWindow(hwnd, SW_MINIMIZE);
                return false;
            }
            if (action == "maximize")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                ShowWindow(hwnd, SW_MAXIMIZE);
                return false;
            }
            if (action == "restore")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                ShowWindow(hwnd, SW_RESTORE);
                return false;
            }
            if (action == "move_window")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
                int w = JsonMini.GetInt(p, "width", 0);
                int h = JsonMini.GetInt(p, "height", 0);
                uint flags = (w > 0 && h > 0) ? SWP_NOZORDER : (SWP_NOSIZE | SWP_NOZORDER);
                SetWindowPos(hwnd, IntPtr.Zero, x, y, Math.Max(0, w), Math.Max(0, h), flags);
                return false;
            }
            if (action == "snap_window")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
                string snap = JsonMini.GetString(p, "snap", JsonMini.GetString(p, "value", JsonMini.GetString(p, "text", "left"))).ToLowerInvariant();
                IntPtr hMon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                MONITORINFOEX mi = new MONITORINFOEX();
                mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
                int wx = 0, wy = 0, ww = 1280, wh = 720;
                if (hMon != IntPtr.Zero && GetMonitorInfo(hMon, ref mi))
                {
                    wx = mi.rcWork.Left;
                    wy = mi.rcWork.Top;
                    ww = Math.Max(100, mi.rcWork.Right - mi.rcWork.Left);
                    wh = Math.Max(100, mi.rcWork.Bottom - mi.rcWork.Top);
                }
                int tx = wx, ty = wy, tw = ww / 2, th = wh;
                if (snap == "right") { tx = wx + ww / 2; tw = ww - ww / 2; }
                else if (snap == "top") { tx = wx; ty = wy; tw = ww; th = wh / 2; }
                else if (snap == "bottom") { tx = wx; ty = wy + wh / 2; tw = ww; th = wh - wh / 2; }
                else if (snap == "center") { tw = (int)(ww * 0.75); th = (int)(wh * 0.8); tx = wx + (ww - tw) / 2; ty = wy + (wh - th) / 2; }
                SetWindowPos(hwnd, IntPtr.Zero, tx, ty, tw, th, SWP_NOZORDER);
                return false;
            }
            if (action == "close_window")
            {
                if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("window_not_found: Invalid hwnd");
                PostMessage(hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                return false;
            }
            if (action == "expand" || action == "collapse" || action == "toggle" ||
                action == "select_item" || action == "set_range" || action == "scroll_into_view")
            {
                if (hwnd == IntPtr.Zero || index < 0)
                    throw new ArgumentException("invalid_argument: UIA semantic action '" + action + "' requires hwnd and UIA control selector/index");
                string semArg = (p.ContainsKey("value") && p["value"] != null)
                    ? Convert.ToString(p["value"], System.Globalization.CultureInfo.InvariantCulture)
                    : JsonMini.GetString(p, "text", "");
                string uiaErr;
                if (!UiaTree.TrySemanticAction(hwnd, index, action, semArg, out uiaErr))
                    throw new InvalidOperationException("semantic_failed: " + uiaErr);
                return true;
            }
            if (action == "file_dialog")
            {
                string filePath = JsonMini.GetString(p, "file_path", JsonMini.GetString(p, "text", ""));
                bool confirm = JsonMini.GetBool(p, "confirm", true);
                UiaTree.AutomateFileDialog(hwnd, filePath, confirm);
                return true;
            }
            throw new ArgumentException("unsupported_action: " + action);
        }

        private static Dictionary<string, object> ExecuteActInternal(Dictionary<string, object> p, int arrowId, bool manageFocusAndCursor)
        {
            if (InputArm.IsEmergencyStopped)
                throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

            IntPtr hwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            string action = JsonMini.GetString(p, "action", "");
            string requestedMode = JsonMini.GetString(p, "mode", "physical").ToLowerInvariant();
            string speed = JsonMini.GetString(p, "speed", "normal");
            int pxPerStep = JsonMini.GetInt(p, "px_per_step", 0);
            int pressure = JsonMini.GetInt(p, "pressure", 720);
            int x = JsonMini.GetInt(p, "x", 0);
            int y = JsonMini.GetInt(p, "y", 0);
            int index = JsonMini.GetInt(p, "index", -1);
            bool physical = JsonMini.GetBool(p, "physical", true);
            bool restoreCursor = JsonMini.GetBool(p, "restore_cursor", false);
            bool showArrows = JsonMini.GetBool(p, "show_arrows", requestedMode != "physical");
            bool expectChange = JsonMini.GetBool(p, "expect_change", false);

            int savedCx = 0, savedCy = 0;
            bool recordSavedCursor = manageFocusAndCursor && restoreCursor && action != "move";
            if (recordSavedCursor) InputArm.GetCursorPosition(out savedCx, out savedCy);
            bool physicalExecuted = false;

            bool didLockRegion = false;
            if (manageFocusAndCursor)
            {
                Rectangle lockRect = ResolveLockRect(p, "lock_region", hwnd);
                if (lockRect.Width > 0 && lockRect.Height > 0)
                {
                    string lockPolicy = JsonMini.GetString(p, "lock_policy", "soft");
                    int lockTtl = JsonMini.GetInt(p, "lock_ttl_ms", 30000);
                    RegionLockOverlay.Lock(lockRect, hwnd, lockPolicy, lockTtl);
                    didLockRegion = true;
                }
            }

            if (expectChange && hwnd != IntPtr.Zero && IsWindow(hwnd))
            {
                RECT vr0, rr0;
                if (GetVisibleWindowRect(hwnd, out vr0))
                {
                    if (!GetWindowRect(hwnd, out rr0)) rr0 = vr0;
                    using (Bitmap preBmp = CaptureVisibleWindowBitmap(hwnd, rr0, vr0))
                    {
                        if (preBmp != null) VisionMath.ComputeFrameDiff(hwnd.ToInt64(), "__expect__", preBmp, vr0.Left, vr0.Top);
                    }
                }
            }

            string resolvedMode = requestedMode;
            bool semanticUsed = false;

            try
            {
                if (requestedMode == "auto")
                {
                    if (index >= 0 && hwnd != IntPtr.Zero && IsWindow(hwnd) &&
                        (action == "click" || action == "double_click" || action == "right_click" || action == "clear_and_type" || action == "set_value"))
                    {
                        string uiaOp = (action == "clear_and_type" || action == "set_value") ? "set_value" : "click";
                        string uiaVal = (uiaOp == "set_value") ? JsonMini.GetString(p, "text", "") : null;
                        string uiaErr;
                        if (UiaTree.TrySemanticAction(hwnd, index, uiaOp, uiaVal, out uiaErr))
                        {
                            resolvedMode = "uia";
                            semanticUsed = true;
                        }
                    }

                    if (!semanticUsed)
                    {
                        if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || !IsProbeableAutoAction(action))
                        {
                            resolvedMode = (action == "move" && hwnd != IntPtr.Zero) ? "virtual" : "physical";
                            if (resolvedMode == "physical") physicalExecuted = true;
                            semanticUsed = ExecuteSingleAction(p, hwnd, action, resolvedMode, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocusAndCursor);
                        }
                        else
                        {
                            string cachedCap = GetCachedCapability(hwnd.ToInt64());
                            if (cachedCap != null)
                            {
                                resolvedMode = (cachedCap == "pen" && !(action == "drag" || action == "batch_strokes")) ? "virtual" : cachedCap;
                                if (resolvedMode == "physical") physicalExecuted = true;
                                semanticUsed = ExecuteSingleAction(p, hwnd, action, resolvedMode, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocusAndCursor);
                            }
                            else
                            {
                                string candidate = ((action == "drag" || action == "batch_strokes") && VirtualPointer.IsPenAvailable()) ? "pen" : "virtual";
                                bool capturedPre = false;
                                RECT vrA, rrA;
                                if (GetVisibleWindowRect(hwnd, out vrA))
                                {
                                    if (!GetWindowRect(hwnd, out rrA)) rrA = vrA;
                                    using (Bitmap preAuto = CaptureVisibleWindowBitmap(hwnd, rrA, vrA))
                                    {
                                        if (preAuto != null)
                                        {
                                            VisionMath.ComputeFrameDiff(hwnd.ToInt64(), "__auto__", preAuto, vrA.Left, vrA.Top);
                                            capturedPre = true;
                                        }
                                    }
                                }

                                bool candidateFailed = false;
                                try
                                {
                                    semanticUsed = ExecuteSingleAction(p, hwnd, action, candidate, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocusAndCursor);
                                }
                                catch (Exception)
                                {
                                    if (InputArm.IsEmergencyStopped) throw;
                                    candidateFailed = true;
                                }

                                bool probeChanged = !candidateFailed;
                                if (!candidateFailed && capturedPre && !semanticUsed)
                                {
                                    Thread.Sleep(35);
                                    RECT vrB, rrB;
                                    if (GetVisibleWindowRect(hwnd, out vrB))
                                    {
                                        if (!GetWindowRect(hwnd, out rrB)) rrB = vrB;
                                        using (Bitmap postAuto = CaptureVisibleWindowBitmap(hwnd, rrB, vrB))
                                        {
                                            if (postAuto != null)
                                            {
                                                Dictionary<string, object> diffAuto = VisionMath.ComputeFrameDiff(hwnd.ToInt64(), "__auto__", postAuto, vrB.Left, vrB.Top);
                                                probeChanged = JsonMini.GetBool(diffAuto, "visual_changed", true);
                                            }
                                        }
                                    }
                                }

                                if (probeChanged)
                                {
                                    resolvedMode = semanticUsed ? "uia" : candidate;
                                    SetCachedCapability(hwnd.ToInt64(), resolvedMode == "uia" ? "virtual" : resolvedMode);
                                }
                                else
                                {
                                    resolvedMode = "physical";
                                    physicalExecuted = true;
                                    semanticUsed = ExecuteSingleAction(p, hwnd, action, "physical", arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, true, true);
                                    SetCachedCapability(hwnd.ToInt64(), "physical");
                                }
                            }
                        }
                    }
                }
                else
                {
                    if (requestedMode == "physical") physicalExecuted = true;
                    semanticUsed = ExecuteSingleAction(p, hwnd, action, requestedMode, arrowId, showArrows, speed, pxPerStep, pressure, x, y, index, physical, manageFocusAndCursor);
                    if (semanticUsed) resolvedMode = "uia";
                }
            }
            finally
            {
                if (didLockRegion) RegionLockOverlay.Unlock();
                if (recordSavedCursor && physicalExecuted && action != "move") InputArm.RestoreCursor(savedCx, savedCy);
            }

            if (expectChange && hwnd != IntPtr.Zero && IsWindow(hwnd))
            {
                Thread.Sleep(30);
                RECT vr1, rr1;
                if (GetVisibleWindowRect(hwnd, out vr1))
                {
                    if (!GetWindowRect(hwnd, out rr1)) rr1 = vr1;
                    using (Bitmap postBmp = CaptureVisibleWindowBitmap(hwnd, rr1, vr1))
                    {
                        if (postBmp != null)
                        {
                            Dictionary<string, object> postDiff = VisionMath.ComputeFrameDiff(hwnd.ToInt64(), "__expect__", postBmp, vr1.Left, vr1.Top);
                            if (!JsonMini.GetBool(postDiff, "visual_changed", true))
                                throw new InvalidOperationException("no_visual_effect: Action produced 0 changed pixels");
                        }
                    }
                }
            }

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["executed"] = true;
            res["action"] = action;
            res["mode"] = requestedMode;
            res["resolved_mode"] = resolvedMode;
            if (semanticUsed) res["semantic"] = true;
            return res;
        }

        private static Dictionary<string, object> HandlePlanBatch(Dictionary<string, object> p)
        {
            if (InputArm.IsEmergencyStopped)
                throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

            IntPtr defaultHwnd = new IntPtr(JsonMini.GetLong(p, "hwnd", 0));
            bool restoreCursor = JsonMini.GetBool(p, "restore_cursor", false);
            string defaultMode = JsonMini.GetString(p, "mode", "physical").ToLowerInvariant();
            string defaultSpeed = JsonMini.GetString(p, "speed", "normal");
            int defaultPxPerStep = JsonMini.GetInt(p, "px_per_step", 0);
            List<object> steps = JsonMini.GetList(p, "steps");
            if (steps == null || steps.Count == 0)
                throw new ArgumentException("invalid_argument: plan_batch requires non-empty steps");

            bool hasPhysical = false;
            for (int i = 0; i < steps.Count; i++)
            {
                Dictionary<string, object> st = steps[i] as Dictionary<string, object>;
                if (st == null) continue;
                string sm = JsonMini.GetString(st, "mode", defaultMode).ToLowerInvariant();
                string sa = JsonMini.GetString(st, "action", "");
                if (sm == "physical" && sa != "sleep" && sa != "move") { hasPhysical = true; break; }
            }

            int savedCx = 0, savedCy = 0;
            bool shouldRestore = restoreCursor;
            if (shouldRestore) InputArm.GetCursorPosition(out savedCx, out savedCy);
            bool anyPhysicalUsed = hasPhysical;

            bool didLockRegion = false;
            Rectangle lockRect = ResolveLockRect(p, "lock_region", defaultHwnd);
            if (lockRect.Width > 0 && lockRect.Height > 0)
            {
                string lockPolicy = JsonMini.GetString(p, "lock_policy", "soft");
                int lockTtl = JsonMini.GetInt(p, "lock_ttl_ms", 30000);
                bool followWin = p.ContainsKey("lock_region") && string.Equals(Convert.ToString(p["lock_region"]), "window", StringComparison.OrdinalIgnoreCase);
                RegionLockOverlay.Lock(lockRect, defaultHwnd, lockPolicy, lockTtl, followWin, string.Format("Plan 0/{0}", steps.Count));
                didLockRegion = true;
            }

            if (hasPhysical && defaultHwnd != IntPtr.Zero && IsWindow(defaultHwnd))
            {
                InputArm.EnsureForeground(defaultHwnd, 150);
            }

            int completed = 0;
            List<object> resolvedModes = new List<object>();
            try
            {
                for (int i = 0; i < steps.Count; i++)
                {
                    if (InputArm.IsEmergencyStopped)
                        throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

                    Dictionary<string, object> st = steps[i] as Dictionary<string, object>;
                    if (st == null) { completed++; continue; }
                    string sa = JsonMini.GetString(st, "action", "");
                    if (didLockRegion)
                    {
                        string lbl = JsonMini.GetString(st, "reason", sa);
                        if (lbl.Length > 28) lbl = lbl.Substring(0, 25) + "...";
                        RegionLockOverlay.SetStatusText(string.Format("Step {0}/{1}: {2}", i + 1, steps.Count, lbl));
                    }
                    if (sa == "sleep")
                    {
                        Thread.Sleep(Math.Min(JsonMini.GetInt(st, "ms", 100), 5000));
                    }
                    else
                    {
                        Dictionary<string, object> execP = new Dictionary<string, object>(st, StringComparer.Ordinal);
                        if (!execP.ContainsKey("hwnd") && defaultHwnd != IntPtr.Zero) execP["hwnd"] = defaultHwnd.ToInt64();
                        if (!execP.ContainsKey("mode")) execP["mode"] = defaultMode;
                        if (!execP.ContainsKey("speed")) execP["speed"] = defaultSpeed;
                        if (!execP.ContainsKey("px_per_step") && defaultPxPerStep > 0) execP["px_per_step"] = defaultPxPerStep;

                        IntPtr stepHwnd = new IntPtr(JsonMini.GetLong(execP, "hwnd", defaultHwnd.ToInt64()));
                        string stepMode = JsonMini.GetString(execP, "mode", defaultMode).ToLowerInvariant();
                        if ((stepMode == "physical" || stepMode == "pen") && stepHwnd != IntPtr.Zero && stepHwnd != defaultHwnd && IsWindow(stepHwnd))
                        {
                            InputArm.EnsureForeground(stepHwnd, 120);
                        }
                        Dictionary<string, object> stepRes = ExecuteActInternal(execP, 1, false);
                        string rm = JsonMini.GetString(stepRes, "resolved_mode", stepMode);
                        if (rm == "physical") anyPhysicalUsed = true;
                        if (!resolvedModes.Contains(rm)) resolvedModes.Add(rm);
                    }
                    completed++;
                }

                Dictionary<string, object> okRes = new Dictionary<string, object>(StringComparer.Ordinal);
                okRes["ok"] = true;
                okRes["completed_steps"] = completed;
                okRes["resolved_modes"] = resolvedModes;
                okRes["region_locked"] = didLockRegion;
                return okRes;
            }
            catch (Exception ex)
            {
                string code = "step_failed";
                string msg = ex.Message ?? "Batch step failed";
                int colon = msg.IndexOf(':');
                if (colon > 0 && colon < 32 && msg.Substring(0, colon).IndexOf(' ') < 0)
                {
                    code = msg.Substring(0, colon);
                    msg = msg.Substring(colon + 1).Trim();
                }
                Dictionary<string, object> errObj = new Dictionary<string, object>(StringComparer.Ordinal);
                errObj["code"] = code;
                errObj["message"] = msg;

                Dictionary<string, object> failRes = new Dictionary<string, object>(StringComparer.Ordinal);
                failRes["ok"] = false;
                failRes["completed_steps"] = completed;
                failRes["failed_step"] = completed;
                failRes["error"] = errObj;
                return failRes;
            }
            finally
            {
                if (didLockRegion) RegionLockOverlay.Unlock();
                if (shouldRestore && anyPhysicalUsed) InputArm.RestoreCursor(savedCx, savedCy);
            }
        }

        private static List<int[]> ParseStrokeList(List<object> ptsObj)
        {
            List<int[]> pts = new List<int[]>();
            if (ptsObj != null)
            {
                for (int i = 0; i < ptsObj.Count; i++)
                {
                    List<object> pair = ptsObj[i] as List<object>;
                    if (pair != null && pair.Count >= 2)
                        pts.Add(new int[] { Convert.ToInt32(pair[0]), Convert.ToInt32(pair[1]) });
                }
            }
            return pts;
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
            InputArm.EnsureForeground(hwnd, 120);
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
        private const int SW_MAXIMIZE = 3;
        private const int SW_MINIMIZE = 6;
        private const int SW_RESTORE = 9;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOZORDER = 0x0004;
        private const uint WM_CLOSE = 0x0010;
        private const uint MONITOR_DEFAULTTONEAREST = 2;
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
        [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);
        [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
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
