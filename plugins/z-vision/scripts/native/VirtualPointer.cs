using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace ZVision.Native
{
    public static class VirtualPointer
    {
        private static bool _touchInitAttempted = false;
        private static bool _touchAvailable = false;
        private static readonly object TouchLock = new object();

        public static bool IsTouchAvailable()
        {
            return EnsureTouchInitialized();
        }

        public static bool EnsureTouchInitialized()
        {
            lock (TouchLock)
            {
                if (_touchInitAttempted) return _touchAvailable;
                _touchInitAttempted = true;
                try
                {
                    _touchAvailable = InitializeTouchInjection(10, TOUCH_FEEDBACK_NONE);
                }
                catch
                {
                    _touchAvailable = false;
                }
                return _touchAvailable;
            }
        }

        public static void ResolveTargetChild(IntPtr rootHwnd, int screenX, int screenY, out IntPtr targetHwnd, out int clientX, out int clientY)
        {
            targetHwnd = rootHwnd;
            IntPtr cur = rootHwnd;
            for (int depth = 0; depth < 16; depth++)
            {
                POINT pt = new POINT();
                pt.X = screenX;
                pt.Y = screenY;
                if (!ScreenToClient(cur, ref pt)) break;
                IntPtr child = ChildWindowFromPointEx(cur, pt, CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT);
                if (child == IntPtr.Zero || child == cur) break;
                cur = child;
            }
            targetHwnd = cur;
            POINT finalPt = new POINT();
            finalPt.X = screenX;
            finalPt.Y = screenY;
            ScreenToClient(targetHwnd, ref finalPt);
            clientX = finalPt.X;
            clientY = finalPt.Y;
        }

        public static void VirtualMove(IntPtr rootHwnd, int sx, int sy, int arrowId, bool showArrows)
        {
            if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
            IntPtr target;
            int cx, cy;
            ResolveTargetChild(rootHwnd, sx, sy, out target, out cx, out cy);
            if (showArrows) ArrowOverlay.ShowArrow(arrowId, sx, sy, "#" + arrowId, 900);
            PostMessage(target, WM_MOUSEMOVE, IntPtr.Zero, MakeLParam(cx, cy));
        }

        public static void VirtualClick(IntPtr rootHwnd, int sx, int sy, string button, int clicks, int arrowId, bool showArrows)
        {
            if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
            IntPtr target;
            int cx, cy;
            ResolveTargetChild(rootHwnd, sx, sy, out target, out cx, out cy);
            if (showArrows) ArrowOverlay.ShowArrow(arrowId, sx, sy, "#" + arrowId, 900);

            string btn = string.IsNullOrEmpty(button) ? "left" : button.ToLowerInvariant();
            uint downMsg = WM_LBUTTONDOWN;
            uint upMsg = WM_LBUTTONUP;
            uint dblMsg = WM_LBUTTONDBLCLK;
            IntPtr downKey = new IntPtr(MK_LBUTTON);
            if (btn == "right") { downMsg = WM_RBUTTONDOWN; upMsg = WM_RBUTTONUP; dblMsg = WM_RBUTTONDBLCLK; downKey = new IntPtr(MK_RBUTTON); }
            else if (btn == "middle") { downMsg = WM_MBUTTONDOWN; upMsg = WM_MBUTTONUP; dblMsg = WM_MBUTTONDBLCLK; downKey = new IntPtr(MK_MBUTTON); }

            IntPtr lp = MakeLParam(cx, cy);
            PostMessage(target, WM_MOUSEMOVE, IntPtr.Zero, lp);
            int count = Math.Max(1, Math.Min(3, clicks));
            for (int c = 0; c < count; c++)
            {
                if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                PostMessage(target, (c == 1) ? dblMsg : downMsg, downKey, lp);
                Thread.Sleep(12);
                PostMessage(target, upMsg, IntPtr.Zero, lp);
                if (c + 1 < count) Thread.Sleep(30);
            }
        }

        public static void VirtualDrag(IntPtr rootHwnd, List<int[]> points, string button, int stepsPerSegment, int arrowId, bool showArrows)
        {
            if (points == null || points.Count < 2) throw new ArgumentException("VirtualDrag requires >= 2 points");
            if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");

            string btn = string.IsNullOrEmpty(button) ? "left" : button.ToLowerInvariant();
            uint downMsg = WM_LBUTTONDOWN;
            uint upMsg = WM_LBUTTONUP;
            IntPtr downKey = new IntPtr(MK_LBUTTON);
            if (btn == "right") { downMsg = WM_RBUTTONDOWN; upMsg = WM_RBUTTONUP; downKey = new IntPtr(MK_RBUTTON); }
            else if (btn == "middle") { downMsg = WM_MBUTTONDOWN; upMsg = WM_MBUTTONUP; downKey = new IntPtr(MK_MBUTTON); }

            IntPtr target;
            int cx0, cy0;
            ResolveTargetChild(rootHwnd, points[0][0], points[0][1], out target, out cx0, out cy0);
            if (showArrows) ArrowOverlay.ShowArrow(arrowId, points[0][0], points[0][1], "#" + arrowId, 1200);

            int steps = Math.Max(1, Math.Min(30, stepsPerSegment));
            PostMessage(target, WM_MOUSEMOVE, IntPtr.Zero, MakeLParam(cx0, cy0));
            PostMessage(target, downMsg, downKey, MakeLParam(cx0, cy0));

            int lastX = cx0, lastY = cy0;
            try
            {
                for (int p = 1; p < points.Count; p++)
                {
                    POINT ptEnd = new POINT();
                    ptEnd.X = points[p][0];
                    ptEnd.Y = points[p][1];
                    ScreenToClient(target, ref ptEnd);

                    POINT ptPrev = new POINT();
                    ptPrev.X = points[p - 1][0];
                    ptPrev.Y = points[p - 1][1];
                    ScreenToClient(target, ref ptPrev);

                    for (int s = 1; s <= steps; s++)
                    {
                        if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                        double t = (double)s / steps;
                        int nx = (int)Math.Round(ptPrev.X + (ptEnd.X - ptPrev.X) * t);
                        int ny = (int)Math.Round(ptPrev.Y + (ptEnd.Y - ptPrev.Y) * t);
                        lastX = nx; lastY = ny;
                        if (showArrows)
                        {
                            int sx = (int)Math.Round(points[p - 1][0] + (points[p][0] - points[p - 1][0]) * t);
                            int sy = (int)Math.Round(points[p - 1][1] + (points[p][1] - points[p - 1][1]) * t);
                            ArrowOverlay.ShowArrow(arrowId, sx, sy, "#" + arrowId, 1000);
                        }
                        PostMessage(target, WM_MOUSEMOVE, downKey, MakeLParam(nx, ny));
                        Thread.Sleep(2);
                    }
                }
            }
            finally
            {
                PostMessage(target, upMsg, IntPtr.Zero, MakeLParam(lastX, lastY));
            }
        }

        public static void VirtualScroll(IntPtr rootHwnd, int sx, int sy, int amount, bool horizontal)
        {
            if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
            IntPtr target;
            int cx, cy;
            ResolveTargetChild(rootHwnd, sx, sy, out target, out cx, out cy);
            uint msg = horizontal ? WM_MOUSEHWHEEL : WM_MOUSEWHEEL;
            int delta = amount * 120;
            IntPtr wp = new IntPtr((delta << 16) & 0xFFFF0000);
            PostMessage(target, msg, wp, MakeLParam(sx, sy));
        }

        public static void VirtualType(IntPtr rootHwnd, string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            IntPtr target = rootHwnd;
            GUITHREADINFO gti = new GUITHREADINFO();
            gti.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
            uint pid;
            uint tid = GetWindowThreadProcessId(rootHwnd, out pid);
            if (tid != 0 && GetGUIThreadInfo(tid, ref gti) && gti.hwndFocus != IntPtr.Zero)
            {
                target = gti.hwndFocus;
            }
            for (int i = 0; i < text.Length; i++)
            {
                if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                char ch = text[i];
                if (ch == '\r') continue;
                if (ch == '\n')
                {
                    PostMessage(target, WM_KEYDOWN, new IntPtr(0x0D), IntPtr.Zero);
                    PostMessage(target, WM_KEYUP, new IntPtr(0x0D), IntPtr.Zero);
                    continue;
                }
                PostMessage(target, WM_CHAR, new IntPtr((int)ch), IntPtr.Zero);
            }
        }

        /// <summary>
        /// Injects up to 10 simultaneous touch contacts in lockstep (no hardware cursor movement).
        /// Each track is a sequence of [x, y] screen coordinates.
        /// </summary>
        public static void MultiTouchDrag(List<List<int[]>> tracks, int stepsPerSegment, bool showArrows)
        {
            if (tracks == null || tracks.Count == 0) throw new ArgumentException("MultiTouchDrag requires >= 1 track");
            if (tracks.Count > 10) throw new ArgumentException("Windows InjectTouchInput supports max 10 simultaneous contacts");
            if (!EnsureTouchInitialized())
                throw new InvalidOperationException("touch_unavailable: InitializeTouchInjection is not supported in this session");

            int count = tracks.Count;
            int steps = Math.Max(1, Math.Min(30, stepsPerSegment));
            POINTER_TOUCH_INFO[] contacts = new POINTER_TOUCH_INFO[count];
            bool downSent = false;

            try
            {
                for (int i = 0; i < count; i++)
                {
                    if (tracks[i] == null || tracks[i].Count < 2)
                        throw new ArgumentException("Each touch track requires >= 2 points");
                    contacts[i] = MakeTouchContact((uint)(i + 1), tracks[i][0][0], tracks[i][0][1],
                        POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
                    if (showArrows) ArrowOverlay.ShowArrow(i + 1, tracks[i][0][0], tracks[i][0][1], "#" + (i + 1), 1200);
                }

                if (!InjectTouchInput((uint)count, contacts))
                    throw new InvalidOperationException("touch_failed: InjectTouchInput DOWN error " + Marshal.GetLastWin32Error());
                downSent = true;
                Thread.Sleep(6);

                int maxSegs = 0;
                for (int i = 0; i < count; i++) maxSegs = Math.Max(maxSegs, tracks[i].Count - 1);

                for (int seg = 0; seg < maxSegs; seg++)
                {
                    for (int s = 1; s <= steps; s++)
                    {
                        if (InputArm.IsEmergencyStopped) throw new InvalidOperationException("emergency_stopped: Esc or Stop halted input");
                        double t = (double)s / steps;
                        for (int i = 0; i < count; i++)
                        {
                            List<int[]> tr = tracks[i];
                            int x, y;
                            if (seg < tr.Count - 1)
                            {
                                x = (int)Math.Round(tr[seg][0] + (tr[seg + 1][0] - tr[seg][0]) * t);
                                y = (int)Math.Round(tr[seg][1] + (tr[seg + 1][1] - tr[seg][1]) * t);
                            }
                            else
                            {
                                int[] last = tr[tr.Count - 1];
                                x = last[0]; y = last[1];
                            }
                            contacts[i] = MakeTouchContact((uint)(i + 1), x, y,
                                POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
                            if (showArrows) ArrowOverlay.ShowArrow(i + 1, x, y, "#" + (i + 1), 1000);
                        }
                        if (!InjectTouchInput((uint)count, contacts))
                            throw new InvalidOperationException("touch_failed: InjectTouchInput UPDATE error " + Marshal.GetLastWin32Error());
                        Thread.Sleep(4);
                    }
                }
            }
            finally
            {
                if (downSent)
                {
                    for (int i = 0; i < count; i++)
                    {
                        int[] last = tracks[i][tracks[i].Count - 1];
                        contacts[i] = MakeTouchContact((uint)(i + 1), last[0], last[1], POINTER_FLAG_UP);
                    }
                    InjectTouchInput((uint)count, contacts);
                }
            }
        }

        private static POINTER_TOUCH_INFO MakeTouchContact(uint id, int x, int y, uint flags)
        {
            POINTER_TOUCH_INFO info = new POINTER_TOUCH_INFO();
            info.pointerInfo.pointerType = PT_TOUCH;
            info.pointerInfo.pointerId = id;
            info.pointerInfo.pointerFlags = flags;
            info.pointerInfo.ptPixelLocation.X = x;
            info.pointerInfo.ptPixelLocation.Y = y;
            info.touchFlags = 0;
            info.touchMask = TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE;
            info.orientation = 90;
            info.pressure = 32000;
            info.rcContact.Left = x - 2;
            info.rcContact.Top = y - 2;
            info.rcContact.Right = x + 2;
            info.rcContact.Bottom = y + 2;
            return info;
        }

        private static IntPtr MakeLParam(int low, int high)
        {
            int packed = (low & 0xFFFF) | ((high & 0xFFFF) << 16);
            return new IntPtr(packed);
        }

        private const uint CWP_SKIPINVISIBLE = 0x0001;
        private const uint CWP_SKIPDISABLED = 0x0002;
        private const uint CWP_SKIPTRANSPARENT = 0x0004;

        private const uint WM_MOUSEMOVE = 0x0200;
        private const uint WM_LBUTTONDOWN = 0x0201;
        private const uint WM_LBUTTONUP = 0x0202;
        private const uint WM_LBUTTONDBLCLK = 0x0203;
        private const uint WM_RBUTTONDOWN = 0x0204;
        private const uint WM_RBUTTONUP = 0x0205;
        private const uint WM_RBUTTONDBLCLK = 0x0206;
        private const uint WM_MBUTTONDOWN = 0x0207;
        private const uint WM_MBUTTONUP = 0x0208;
        private const uint WM_MBUTTONDBLCLK = 0x0209;
        private const uint WM_MOUSEWHEEL = 0x020A;
        private const uint WM_MOUSEHWHEEL = 0x020E;
        private const uint WM_KEYDOWN = 0x0100;
        private const uint WM_KEYUP = 0x0101;
        private const uint WM_CHAR = 0x0102;

        private const int MK_LBUTTON = 0x0001;
        private const int MK_RBUTTON = 0x0002;
        private const int MK_MBUTTON = 0x0010;

        private const uint TOUCH_FEEDBACK_NONE = 0x00000003;
        private const uint PT_TOUCH = 0x00000002;
        private const uint POINTER_FLAG_INRANGE = 0x00000002;
        private const uint POINTER_FLAG_INCONTACT = 0x00000004;
        private const uint POINTER_FLAG_DOWN = 0x00010000;
        private const uint POINTER_FLAG_UPDATE = 0x00020000;
        private const uint POINTER_FLAG_UP = 0x00040000;
        private const uint TOUCH_MASK_CONTACTAREA = 0x00000001;
        private const uint TOUCH_MASK_ORIENTATION = 0x00000002;
        private const uint TOUCH_MASK_PRESSURE = 0x00000004;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        private struct GUITHREADINFO
        {
            public int cbSize;
            public uint flags;
            public IntPtr hwndActive;
            public IntPtr hwndFocus;
            public IntPtr hwndCapture;
            public IntPtr hwndMenuOwner;
            public IntPtr hwndMoveSize;
            public IntPtr hwndCaret;
            public RECT rcCaret;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINTER_INFO
        {
            public uint pointerType;
            public uint pointerId;
            public uint frameId;
            public uint pointerFlags;
            public IntPtr sourceDevice;
            public IntPtr hwndTarget;
            public POINT ptPixelLocation;
            public POINT ptHimetricLocation;
            public POINT ptPixelLocationRaw;
            public POINT ptHimetricLocationRaw;
            public uint dwTime;
            public uint historyCount;
            public int inputData;
            public uint dwKeyStates;
            public ulong PerformanceCount;
            public int ButtonChangeType;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINTER_TOUCH_INFO
        {
            public POINTER_INFO pointerInfo;
            public uint touchFlags;
            public uint touchMask;
            public RECT rcContact;
            public RECT rcContactRaw;
            public uint orientation;
            public uint pressure;
        }

        [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);
        [DllImport("user32.dll")] private static extern IntPtr ChildWindowFromPointEx(IntPtr hwndParent, POINT pt, uint flags);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool InitializeTouchInjection(uint maxCount, uint dwMode);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool InjectTouchInput(uint count, [In] POINTER_TOUCH_INFO[] contacts);
    }
}
