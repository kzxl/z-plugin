using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ZVision.Native
{
    public static class InputArm
    {
        private sealed class LockRegionState
        {
            public readonly int Left;
            public readonly int Top;
            public readonly int Right;
            public readonly int Bottom;
            public readonly IntPtr TargetHwnd;
            public readonly bool Strict;

            public LockRegionState(Rectangle r, IntPtr hwnd, bool strict)
            {
                Left = r.Left;
                Top = r.Top;
                Right = r.Right;
                Bottom = r.Bottom;
                TargetHwnd = hwnd;
                Strict = strict;
            }
        }

        private static int _emergencyStopped = 0;
        private static readonly object LedgerLock = new object();
        private static readonly HashSet<ushort> HeldKeys = new HashSet<ushort>();
        private static readonly HashSet<string> HeldButtons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private static Thread _hookThread;
        private static uint _hookThreadId = 0;
        private static IntPtr _hookHandle = IntPtr.Zero;
        private static HookProc _hookDelegate;
        private static IntPtr _mouseHookHandle = IntPtr.Zero;
        private static HookProc _mouseHookDelegate;
        private static volatile LockRegionState _lockState;
        private static long _blockedEventCount = 0;

        private static readonly object MetricsLock = new object();
        private static int _vx = 0;
        private static int _vy = 0;
        private static int _vw = 0;
        private static int _vh = 0;
        private static int _metricsTick = 0;

        public static void RefreshScreenMetrics()
        {
            lock (MetricsLock)
            {
                _vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                _vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
                _vw = Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
                _vh = Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));
                _metricsTick = Environment.TickCount;
            }
        }

        private static void GetScreenMetrics(out int vx, out int vy, out int vw, out int vh)
        {
            int now = Environment.TickCount;
            if (_vw <= 0 || unchecked(now - _metricsTick) > 5000)
            {
                RefreshScreenMetrics();
            }
            lock (MetricsLock)
            {
                vx = _vx;
                vy = _vy;
                vw = _vw;
                vh = _vh;
            }
        }

        public static int ResolveSpeedDelayMs(string speed)
        {
            if (string.IsNullOrEmpty(speed)) return 2;
            string s = speed.ToLowerInvariant();
            if (s == "instant") return 0;
            if (s == "fast") return 1;
            if (s == "human") return 4;
            return 2;
        }

        public static bool EnsureForeground(IntPtr hwnd, int timeoutMs)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return false;
            if (GetForegroundWindow() == hwnd) return true;
            if (IsIconic(hwnd)) ShowWindow(hwnd, 9); // SW_RESTORE

            SetForegroundWindow(hwnd);
            if (GetForegroundWindow() != hwnd)
            {
                IntPtr fg = GetForegroundWindow();
                uint fgTid = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, IntPtr.Zero) : 0;
                uint tgtTid = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
                uint curTid = GetCurrentThreadId();
                bool attFg = false, attTgt = false;
                try
                {
                    if (fgTid != 0 && fgTid != curTid) attFg = AttachThreadInput(curTid, fgTid, true);
                    if (tgtTid != 0 && tgtTid != curTid && tgtTid != fgTid) attTgt = AttachThreadInput(curTid, tgtTid, true);
                    BringWindowToTop(hwnd);
                    SetForegroundWindow(hwnd);
                }
                finally
                {
                    if (attTgt) AttachThreadInput(curTid, tgtTid, false);
                    if (attFg) AttachThreadInput(curTid, fgTid, false);
                }
            }

            int limit = Math.Max(0, Math.Min(timeoutMs, 200));
            int waited = 0;
            while (waited < limit && GetForegroundWindow() != hwnd)
            {
                Thread.Sleep(10);
                waited += 10;
            }
            return GetForegroundWindow() == hwnd;
        }

        public static void ClearAndType(string text)
        {
            EnsureNotStopped();
            PressChord("home");
            Thread.Sleep(10);
            PressChord("shift+end");
            Thread.Sleep(10);
            PressChord("backspace");
            Thread.Sleep(10);
            TypeUnicode(text);
        }

        public static bool IsEmergencyStopped
        {
            get { return Interlocked.CompareExchange(ref _emergencyStopped, 0, 0) != 0; }
        }

        public static void SetInputLock(Rectangle rect, IntPtr targetHwnd, string policy)
        {
            bool strict = string.Equals(policy, "strict", StringComparison.OrdinalIgnoreCase);
            _lockState = new LockRegionState(rect, targetHwnd, strict);
        }

        public static void ClearInputLock()
        {
            _lockState = null;
        }

        public static long GetBlockedEventCount()
        {
            return Interlocked.Read(ref _blockedEventCount);
        }

        public static void SetEmergencyStopped(bool value)
        {
            Interlocked.Exchange(ref _emergencyStopped, value ? 1 : 0);
            if (value)
            {
                ArrowOverlay.ClearAll();
                RegionLockOverlay.Unlock();
                ClearInputLock();
                ReleaseAll();
            }
        }

        public static void GetCursorPosition(out int x, out int y)
        {
            POINT pt;
            if (GetCursorPos(out pt)) { x = pt.X; y = pt.Y; }
            else { x = 0; y = 0; }
        }

        public static void RestoreCursor(int x, int y)
        {
            MoveAbs(x, y);
        }

        public static int ReleaseAll()
        {
            List<INPUT> inputs = new List<INPUT>();
            int released = 0;
            lock (LedgerLock)
            {
                foreach (ushort vk in HeldKeys)
                {
                    inputs.Add(MakeKeyInput(vk, true));
                    released++;
                }
                HeldKeys.Clear();

                foreach (string btn in HeldButtons)
                {
                    uint flag = MOUSEEVENTF_LEFTUP;
                    if (btn == "right") flag = MOUSEEVENTF_RIGHTUP;
                    else if (btn == "middle") flag = MOUSEEVENTF_MIDDLEUP;
                    inputs.Add(MakeMouseInput(0, 0, flag, 0));
                    released++;
                }
                HeldButtons.Clear();
            }

            // Always ensure common modifier keys are released defensively if anything was held
            if (inputs.Count > 0)
            {
                SendInputs(inputs.ToArray());
            }
            return released;
        }

        public static void StartEmergencyHook()
        {
            if (_hookThread != null) return;
            ManualResetEventSlim ready = new ManualResetEventSlim(false);
            _hookThread = new Thread(delegate()
            {
                _hookThreadId = GetCurrentThreadId();
                _hookDelegate = new HookProc(HookCallback);
                _mouseHookDelegate = new HookProc(MouseHookCallback);
                IntPtr hMod = GetModuleHandle(null);
                _hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, _hookDelegate, hMod, 0);
                _mouseHookHandle = SetWindowsHookEx(WH_MOUSE_LL, _mouseHookDelegate, hMod, 0);
                ready.Set();
                MSG msg;
                while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
                {
                    TranslateMessage(ref msg);
                    DispatchMessage(ref msg);
                }
                if (_hookHandle != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(_hookHandle);
                    _hookHandle = IntPtr.Zero;
                }
                if (_mouseHookHandle != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(_mouseHookHandle);
                    _mouseHookHandle = IntPtr.Zero;
                }
            });
            _hookThread.IsBackground = true;
            _hookThread.Name = "ZVisionEmergencyHook";
            _hookThread.Start();
            ready.Wait(2000);
        }

        public static void StopEmergencyHook()
        {
            if (_hookThreadId != 0)
            {
                PostThreadMessage(_hookThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
            }
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN)
                {
                    KBDLLHOOKSTRUCT info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                    bool injected = (info.flags & LLKHF_INJECTED) != 0;
                    if (!injected)
                    {
                        bool isEsc = info.vkCode == 0x1B;
                        bool isCtrlAltF12 = info.vkCode == 0x7B &&
                            (GetAsyncKeyState(0x11) & 0x8000) != 0 &&
                            (GetAsyncKeyState(0x12) & 0x8000) != 0;
                        if (isEsc || isCtrlAltF12)
                        {
                            Interlocked.Exchange(ref _emergencyStopped, 1);
                            ClearInputLock();
                            ThreadPool.QueueUserWorkItem(delegate(object _)
                            {
                                RegionLockOverlay.Unlock();
                                ReleaseAll();
                            });
                            return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
                        }

                        LockRegionState lockState = _lockState;
                        if (lockState != null && lockState.TargetHwnd != IntPtr.Zero && GetForegroundWindow() == lockState.TargetHwnd)
                        {
                            bool isWin = info.vkCode == 0x5B || info.vkCode == 0x5C;
                            bool isAltTab = info.vkCode == 0x09 &&
                                ((info.flags & 0x20) != 0 || (GetAsyncKeyState(0x12) & 0x8000) != 0);
                            if (!isWin && !isAltTab)
                            {
                                Interlocked.Increment(ref _blockedEventCount);
                                RegionLockOverlay.NotifyBlockedInput();
                                return new IntPtr(1);
                            }
                        }
                    }
                }
            }
            return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
        }

        private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                LockRegionState lockState = _lockState;
                if (lockState != null)
                {
                    MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                    bool injected = (info.flags & LLMHF_INJECTED_MASK) != 0;
                    if (!injected &&
                        info.pt.X >= lockState.Left && info.pt.X < lockState.Right &&
                        info.pt.Y >= lockState.Top && info.pt.Y < lockState.Bottom)
                    {
                        int msg = wParam.ToInt32();
                        if (msg == WM_MOUSEMOVE)
                        {
                            if (lockState.Strict)
                            {
                                Interlocked.Increment(ref _blockedEventCount);
                                RegionLockOverlay.NotifyBlockedInput();
                                return new IntPtr(1);
                            }
                        }
                        else if (msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN || msg == WM_MBUTTONDOWN ||
                                 msg == WM_XBUTTONDOWN || msg == WM_MOUSEWHEEL || msg == WM_MOUSEHWHEEL)
                        {
                            Interlocked.Increment(ref _blockedEventCount);
                            RegionLockOverlay.NotifyBlockedInput();
                            return new IntPtr(1);
                        }
                    }
                }
            }
            return CallNextHookEx(_mouseHookHandle, nCode, wParam, lParam);
        }

        private static void EnsureNotStopped()
        {
            if (IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
        }

        public static void MoveSmooth(int targetX, int targetY, int steps)
        {
            MoveSmooth(targetX, targetY, steps, 2);
        }

        public static void MoveSmooth(int targetX, int targetY, int steps, int stepDelayMs)
        {
            EnsureNotStopped();
            if (steps < 1) steps = 1;
            if (steps > 40) steps = 40;
            POINT cur;
            if (!GetCursorPos(out cur) || steps == 1)
            {
                MoveAbs(targetX, targetY, true);
                return;
            }
            for (int i = 1; i <= steps; i++)
            {
                EnsureNotStopped();
                double t = (double)i / steps;
                int nx = (int)Math.Round(cur.X + (targetX - cur.X) * t);
                int ny = (int)Math.Round(cur.Y + (targetY - cur.Y) * t);
                MoveAbs(nx, ny, i == steps);
                if (stepDelayMs > 0 && i < steps) Thread.Sleep(stepDelayMs);
            }
        }

        public static void Click(int x, int y, string button, int clicks)
        {
            EnsureNotStopped();
            MoveSmooth(x, y, 5, 1);
            string btn = string.IsNullOrEmpty(button) ? "left" : button.ToLowerInvariant();
            uint downFlag = MOUSEEVENTF_LEFTDOWN;
            uint upFlag = MOUSEEVENTF_LEFTUP;
            if (btn == "right") { downFlag = MOUSEEVENTF_RIGHTDOWN; upFlag = MOUSEEVENTF_RIGHTUP; }
            else if (btn == "middle") { downFlag = MOUSEEVENTF_MIDDLEDOWN; upFlag = MOUSEEVENTF_MIDDLEUP; }

            if (clicks < 1) clicks = 1;
            if (clicks > 3) clicks = 3;
            for (int c = 0; c < clicks; c++)
            {
                EnsureNotStopped();
                lock (LedgerLock) { HeldButtons.Add(btn); }
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, downFlag, 0) });
                Thread.Sleep(15);
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, upFlag, 0) });
                lock (LedgerLock) { HeldButtons.Remove(btn); }
                if (c + 1 < clicks) Thread.Sleep(40);
            }
        }

        public static void Drag(List<int[]> points, string button, int stepsPerSegment)
        {
            Drag(points, button, stepsPerSegment, "normal", 0);
        }

        public static void Drag(List<int[]> points, string button, int stepsPerSegment, string speed, int pxPerStep)
        {
            if (points == null || points.Count < 2) throw new ArgumentException("Drag requires >= 2 points");
            EnsureNotStopped();
            string btn = string.IsNullOrEmpty(button) ? "left" : button.ToLowerInvariant();
            uint downFlag = MOUSEEVENTF_LEFTDOWN;
            uint upFlag = MOUSEEVENTF_LEFTUP;
            if (btn == "right") { downFlag = MOUSEEVENTF_RIGHTDOWN; upFlag = MOUSEEVENTF_RIGHTUP; }
            else if (btn == "middle") { downFlag = MOUSEEVENTF_MIDDLEDOWN; upFlag = MOUSEEVENTF_MIDDLEUP; }

            int delayMs = ResolveSpeedDelayMs(speed);
            int downDelay = delayMs == 0 ? 4 : (delayMs == 1 ? 8 : 18);
            int upDelay = delayMs == 0 ? 3 : (delayMs == 1 ? 6 : 14);

            MoveSmooth(points[0][0], points[0][1], delayMs == 0 ? 1 : 3, delayMs);
            lock (LedgerLock) { HeldButtons.Add(btn); }
            try
            {
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, downFlag, 0) });
                Thread.Sleep(downDelay);
                for (int p = 1; p < points.Count; p++)
                {
                    int segSteps = stepsPerSegment;
                    if (pxPerStep > 0 || stepsPerSegment <= 0)
                    {
                        double dx = points[p][0] - points[p - 1][0];
                        double dy = points[p][1] - points[p - 1][1];
                        double dist = Math.Sqrt(dx * dx + dy * dy);
                        int stride = pxPerStep > 0 ? Math.Max(4, pxPerStep) : (delayMs <= 1 ? 18 : 12);
                        segSteps = Math.Max(2, Math.Min(40, (int)Math.Ceiling(dist / stride)));
                    }
                    MoveSmooth(points[p][0], points[p][1], segSteps, delayMs);
                }
                Thread.Sleep(upDelay);
            }
            finally
            {
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, upFlag, 0) });
                lock (LedgerLock) { HeldButtons.Remove(btn); }
            }
        }

        public static void Scroll(int x, int y, int amount, bool horizontal)
        {
            EnsureNotStopped();
            MoveSmooth(x, y, 2);
            uint flag = horizontal ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
            // Win32 WHEEL_DELTA = 120
            int delta = amount * 120;
            SendInputs(new INPUT[] { MakeMouseInput(0, 0, flag, (uint)delta) });
        }

        public static void TypeUnicode(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            EnsureNotStopped();
            for (int i = 0; i < text.Length; i++)
            {
                EnsureNotStopped();
                char ch = text[i];
                if (ch == '\r') continue;
                if (ch == '\n')
                {
                    PressChord("enter");
                    continue;
                }
                INPUT down = MakeUnicodeInput(ch, false);
                INPUT up = MakeUnicodeInput(ch, true);
                SendInputs(new INPUT[] { down, up });
                if ((i & 7) == 7) Thread.Sleep(4);
            }
        }

        public static void PressChord(string chord)
        {
            if (string.IsNullOrEmpty(chord)) throw new ArgumentException("Empty key chord");
            EnsureNotStopped();
            string[] parts = chord.Split(new char[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
            List<ushort> vks = new List<ushort>();
            for (int i = 0; i < parts.Length; i++)
            {
                ushort vk = ResolveVirtualKey(parts[i].Trim());
                if (vk == 0) throw new ArgumentException("Unknown key token: " + parts[i]);
                vks.Add(vk);
            }

            List<ushort> pressed = new List<ushort>();
            try
            {
                for (int i = 0; i < vks.Count; i++)
                {
                    EnsureNotStopped();
                    ushort vk = vks[i];
                    lock (LedgerLock) { HeldKeys.Add(vk); }
                    pressed.Add(vk);
                    SendInputs(new INPUT[] { MakeKeyInput(vk, false) });
                    Thread.Sleep(8);
                }
            }
            finally
            {
                for (int i = pressed.Count - 1; i >= 0; i--)
                {
                    ushort vk = pressed[i];
                    SendInputs(new INPUT[] { MakeKeyInput(vk, true) });
                    lock (LedgerLock) { HeldKeys.Remove(vk); }
                }
            }
        }

        public static void PasteText(string text)
        {
            EnsureNotStopped();
            Exception staErr = null;
            Thread t = new Thread(delegate()
            {
                try
                {
                    string prior = null;
                    bool hadText = false;
                    try
                    {
                        if (Clipboard.ContainsText())
                        {
                            prior = Clipboard.GetText();
                            hadText = true;
                        }
                    }
                    catch { }

                    Clipboard.SetText(text ?? "");
                    Thread.Sleep(20);
                    PressChord("ctrl+v");
                    Thread.Sleep(70);

                    if (hadText && prior != null)
                    {
                        try
                        {
                            if (Clipboard.ContainsText() && Clipboard.GetText() == (text ?? ""))
                            {
                                Clipboard.SetText(prior);
                            }
                        }
                        catch { }
                    }
                }
                catch (Exception ex)
                {
                    staErr = ex;
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(5000);
            if (staErr != null) throw staErr;
        }

        private static void MoveAbs(int x, int y)
        {
            MoveAbs(x, y, true);
        }

        private static void MoveAbs(int x, int y, bool verifyPos)
        {
            int vx, vy, vw, vh;
            GetScreenMetrics(out vx, out vy, out vw, out vh);

            // Win32 virtual-desktop normalized coordinate formula mapping pixel centers cleanly
            long axL = ((long)(x - vx) * 65536L + 32768L) / vw;
            long ayL = ((long)(y - vy) * 65536L + 32768L) / vh;
            int ax = (int)Math.Max(0, Math.Min(65535, axL));
            int ay = (int)Math.Max(0, Math.Min(65535, ayL));

            SendInputs(new INPUT[] {
                MakeMouseInput(ax, ay, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0)
            });

            if (verifyPos)
            {
                POINT check;
                if (GetCursorPos(out check) && (Math.Abs(check.X - x) > 1 || Math.Abs(check.Y - y) > 1))
                {
                    SetCursorPos(x, y);
                }
            }
        }

        private static ushort ResolveVirtualKey(string token)
        {
            string k = token.ToLowerInvariant();
            if (k == "ctrl" || k == "control" || k == "lctrl") return 0xA2;
            if (k == "rctrl") return 0xA3;
            if (k == "shift" || k == "lshift") return 0xA0;
            if (k == "rshift") return 0xA1;
            if (k == "alt" || k == "option" || k == "lalt") return 0xA4;
            if (k == "ralt") return 0xA5;
            if (k == "win" || k == "meta" || k == "super" || k == "lwin") return 0x5B;
            if (k == "enter" || k == "return") return 0x0D;
            if (k == "tab") return 0x09;
            if (k == "esc" || k == "escape") return 0x1B;
            if (k == "space") return 0x20;
            if (k == "backspace" || k == "bksp") return 0x08;
            if (k == "del" || k == "delete") return 0x2E;
            if (k == "ins" || k == "insert") return 0x2D;
            if (k == "home") return 0x24;
            if (k == "end") return 0x23;
            if (k == "pgup" || k == "pageup") return 0x21;
            if (k == "pgdn" || k == "pagedown") return 0x22;
            if (k == "left") return 0x25;
            if (k == "up") return 0x26;
            if (k == "right") return 0x27;
            if (k == "down") return 0x28;
            if (k == "apps" || k == "menu") return 0x5D;
            if (k.Length >= 2 && k[0] == 'f')
            {
                int fn;
                if (int.TryParse(k.Substring(1), out fn) && fn >= 1 && fn <= 24) return (ushort)(0x6F + fn);
            }
            if (k.Length == 1)
            {
                char ch = char.ToUpperInvariant(k[0]);
                if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) return (ushort)ch;
                short vkScan = VkKeyScan(k[0]);
                if (vkScan != -1) return (ushort)(vkScan & 0xFF);
            }
            return 0;
        }

        private static INPUT MakeMouseInput(int dx, int dy, uint flags, uint mouseData)
        {
            INPUT inp = new INPUT();
            inp.type = INPUT_MOUSE;
            inp.U.mi.dx = dx;
            inp.U.mi.dy = dy;
            inp.U.mi.mouseData = mouseData;
            inp.U.mi.dwFlags = flags;
            return inp;
        }

        private static INPUT MakeKeyInput(ushort vk, bool keyUp)
        {
            INPUT inp = new INPUT();
            inp.type = INPUT_KEYBOARD;
            inp.U.ki.wVk = vk;
            inp.U.ki.wScan = (ushort)MapVirtualKey(vk, 0);
            inp.U.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            if (IsExtendedKey(vk)) inp.U.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
            return inp;
        }

        private static INPUT MakeUnicodeInput(char ch, bool keyUp)
        {
            INPUT inp = new INPUT();
            inp.type = INPUT_KEYBOARD;
            inp.U.ki.wVk = 0;
            inp.U.ki.wScan = ch;
            inp.U.ki.dwFlags = KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0);
            return inp;
        }

        private static bool IsExtendedKey(ushort vk)
        {
            return vk == 0xA3 || vk == 0xA5 || vk == 0x5B || (vk >= 0x21 && vk <= 0x2E) || vk == 0x2D;
        }

        private static void SendInputs(INPUT[] inputs)
        {
            if (inputs == null || inputs.Length == 0) return;
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private const int INPUT_MOUSE = 0;
        private const int INPUT_KEYBOARD = 1;
        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_HWHEEL = 0x1000;
        private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        private const int SM_XVIRTUALSCREEN = 76;
        private const int SM_YVIRTUALSCREEN = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;

        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_QUIT = 0x0012;
        private const uint LLKHF_INJECTED = 0x10;
        private const uint LLMHF_INJECTED_MASK = 0x03;

        private const int WM_MOUSEMOVE = 0x0200;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_MBUTTONDOWN = 0x0207;
        private const int WM_MOUSEWHEEL = 0x020A;
        private const int WM_XBUTTONDOWN = 0x020B;
        private const int WM_MOUSEHWHEEL = 0x020E;

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT
        {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public UIntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public int type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        private static extern short VkKeyScan(char ch);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll")]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern bool PostThreadMessage(uint idThread, uint Msg, UIntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
        [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    }
}
