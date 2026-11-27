using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ZVision.Native
{
    public static class InputArm
    {
        private static int _emergencyStopped = 0;
        private static readonly object LedgerLock = new object();
        private static readonly HashSet<ushort> HeldKeys = new HashSet<ushort>();
        private static readonly HashSet<string> HeldButtons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private static Thread _hookThread;
        private static uint _hookThreadId = 0;
        private static IntPtr _hookHandle = IntPtr.Zero;
        private static HookProc _hookDelegate;

        public static bool IsEmergencyStopped
        {
            get { return Interlocked.CompareExchange(ref _emergencyStopped, 0, 0) != 0; }
        }

        public static void SetEmergencyStopped(bool value)
        {
            Interlocked.Exchange(ref _emergencyStopped, value ? 1 : 0);
            if (value) ReleaseAll();
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
                IntPtr hMod = GetModuleHandle(null);
                _hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, _hookDelegate, hMod, 0);
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
                            ThreadPool.QueueUserWorkItem(delegate(object _) { ReleaseAll(); });
                        }
                    }
                }
            }
            return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
        }

        private static void EnsureNotStopped()
        {
            if (IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
        }

        public static void MoveSmooth(int targetX, int targetY, int steps)
        {
            EnsureNotStopped();
            if (steps < 1) steps = 1;
            if (steps > 40) steps = 40;
            POINT cur;
            if (!GetCursorPos(out cur) || steps == 1)
            {
                MoveAbs(targetX, targetY);
                return;
            }
            for (int i = 1; i <= steps; i++)
            {
                EnsureNotStopped();
                double t = (double)i / steps;
                int nx = (int)Math.Round(cur.X + (targetX - cur.X) * t);
                int ny = (int)Math.Round(cur.Y + (targetY - cur.Y) * t);
                MoveAbs(nx, ny);
                if (i < steps) Thread.Sleep(4);
            }
        }

        public static void Click(int x, int y, string button, int clicks)
        {
            EnsureNotStopped();
            MoveSmooth(x, y, 5);
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
                Thread.Sleep(18);
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, upFlag, 0) });
                lock (LedgerLock) { HeldButtons.Remove(btn); }
                if (c + 1 < clicks) Thread.Sleep(45);
            }
        }

        public static void Drag(List<int[]> points, string button, int stepsPerSegment)
        {
            if (points == null || points.Count < 2) throw new ArgumentException("Drag requires >= 2 points");
            EnsureNotStopped();
            string btn = string.IsNullOrEmpty(button) ? "left" : button.ToLowerInvariant();
            uint downFlag = MOUSEEVENTF_LEFTDOWN;
            uint upFlag = MOUSEEVENTF_LEFTUP;
            if (btn == "right") { downFlag = MOUSEEVENTF_RIGHTDOWN; upFlag = MOUSEEVENTF_RIGHTUP; }
            else if (btn == "middle") { downFlag = MOUSEEVENTF_MIDDLEDOWN; upFlag = MOUSEEVENTF_MIDDLEUP; }

            MoveSmooth(points[0][0], points[0][1], 4);
            lock (LedgerLock) { HeldButtons.Add(btn); }
            try
            {
                SendInputs(new INPUT[] { MakeMouseInput(0, 0, downFlag, 0) });
                Thread.Sleep(25);
                for (int p = 1; p < points.Count; p++)
                {
                    MoveSmooth(points[p][0], points[p][1], stepsPerSegment);
                }
                Thread.Sleep(20);
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
            int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int vw = Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
            int vh = Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));

            int ax = (int)Math.Round(((x - vx) * 65535.0) / Math.Max(1, vw - 1));
            int ay = (int)Math.Round(((y - vy) * 65535.0) / Math.Max(1, vh - 1));
            if (ax < 0) ax = 0; if (ax > 65535) ax = 65535;
            if (ay < 0) ay = 0; if (ay > 65535) ay = 65535;

            SendInputs(new INPUT[] {
                MakeMouseInput(ax, ay, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0)
            });
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
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_QUIT = 0x0012;
        private const uint LLKHF_INJECTED = 0x10;

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
    }
}
