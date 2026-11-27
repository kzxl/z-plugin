using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ZVision.Native
{
    public static class RegionLockOverlay
    {
        private const int WS_EX_TRANSPARENT = 0x00000020;
        private const int WS_EX_LAYERED = 0x00080000;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_NOACTIVATE = 0x08000000;
        private const int WS_EX_TOPMOST = 0x00000008;
        private const int SW_SHOWNA = 8;
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;
        private const int MAX_TTL_MS = 30000;

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

        private static readonly object _sync = new object();
        private static Thread _uiThread;
        private static LockForm _form;
        private static ManualResetEventSlim _ready;

        private static volatile bool _locked;
        private static volatile bool _excludeFromCapture;
        private static long _targetHwndVal;
        private static int _x;
        private static int _y;
        private static int _w;
        private static int _h;
        private static string _policy = "soft";
        private static int _unlockAtTick;
        private static int _flashUntilTick;

        private static void EnsureThread()
        {
            lock (_sync)
            {
                if (_form != null && !_form.IsDisposed && _uiThread != null && _uiThread.IsAlive) return;
                _ready = new ManualResetEventSlim(false);
                _uiThread = new Thread(delegate()
                {
                    Application.EnableVisualStyles();
                    _form = new LockForm();
                    IntPtr ensureHandle = _form.Handle;
                    _ready.Set();
                    Application.Run();
                });
                _uiThread.IsBackground = true;
                _uiThread.Name = "ZVisionRegionLock";
                _uiThread.SetApartmentState(ApartmentState.STA);
                _uiThread.Start();
                _ready.Wait(3000);
            }
        }

        public static void Lock(Rectangle rect, IntPtr targetHwnd, string policy, int ttlMs)
        {
            if (rect.Width <= 0 || rect.Height <= 0)
            {
                Unlock();
                return;
            }
            string normPolicy = string.IsNullOrEmpty(policy) ? "soft" : policy.ToLowerInvariant();
            if (normPolicy != "strict" && normPolicy != "soft") normPolicy = "soft";

            int clampedTtl = ttlMs <= 0 ? MAX_TTL_MS : Math.Min(MAX_TTL_MS, Math.Max(500, ttlMs));
            int now = Environment.TickCount;

            EnsureThread();
            lock (_sync)
            {
                _x = rect.X;
                _y = rect.Y;
                _w = rect.Width;
                _h = rect.Height;
                _policy = normPolicy;
                Interlocked.Exchange(ref _targetHwndVal, targetHwnd.ToInt64());
                Interlocked.Exchange(ref _unlockAtTick, unchecked(now + clampedTtl));
                Interlocked.Exchange(ref _flashUntilTick, 0);
                _locked = true;
            }

            InputArm.SetInputLock(rect, targetHwnd, normPolicy);

            if (_form != null && !_form.IsDisposed && _form.IsHandleCreated)
            {
                try
                {
                    _form.BeginInvoke((MethodInvoker)delegate()
                    {
                        _form.ApplyLockBounds(rect);
                    });
                }
                catch { }
            }
        }

        public static void Unlock()
        {
            _locked = false;
            InputArm.ClearInputLock();
            if (_form != null && !_form.IsDisposed && _form.IsHandleCreated)
            {
                try
                {
                    _form.BeginInvoke((MethodInvoker)delegate()
                    {
                        _form.HideLock();
                    });
                }
                catch { }
            }
        }

        public static void NotifyBlockedInput()
        {
            if (!_locked) return;
            int until = unchecked(Environment.TickCount + 350);
            Interlocked.Exchange(ref _flashUntilTick, until);
        }

        public static Dictionary<string, object> GetState()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            bool active = _locked;
            int ttlRem = 0;
            int x = _x, y = _y, w = _w, h = _h;
            string pol = _policy;
            long hwndVal = Interlocked.Read(ref _targetHwndVal);

            if (active)
            {
                int rem = unchecked(Interlocked.CompareExchange(ref _unlockAtTick, 0, 0) - Environment.TickCount);
                if (rem <= 0)
                {
                    Unlock();
                    active = false;
                }
                else
                {
                    ttlRem = rem;
                }
            }

            d["active"] = active;
            d["policy"] = pol;
            d["target_hwnd"] = hwndVal;
            d["ttl_remaining_ms"] = ttlRem;
            d["blocked_events"] = InputArm.GetBlockedEventCount();
            d["exclude_from_capture"] = _excludeFromCapture;
            if (active && w > 0 && h > 0)
            {
                d["bounds"] = new List<object> { x, y, w, h };
            }
            else
            {
                d["bounds"] = null;
            }
            return d;
        }

        private sealed class LockForm : Form
        {
            private readonly System.Windows.Forms.Timer _timer;
            private bool _lastFlash;

            public LockForm()
            {
                FormBorderStyle = FormBorderStyle.None;
                ShowInTaskbar = false;
                TopMost = true;
                StartPosition = FormStartPosition.Manual;
                DoubleBuffered = true;
                BackColor = Color.FromArgb(16, 22, 34);
                Opacity = 0.22;
                Bounds = new Rectangle(-32000, -32000, 10, 10);

                _timer = new System.Windows.Forms.Timer();
                _timer.Interval = 33;
                _timer.Tick += OnTick;
                _timer.Start();
            }

            protected override bool ShowWithoutActivation
            {
                get { return true; }
            }

            protected override CreateParams CreateParams
            {
                get
                {
                    CreateParams cp = base.CreateParams;
                    cp.ExStyle |= WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST;
                    return cp;
                }
            }

            protected override void OnHandleCreated(EventArgs e)
            {
                base.OnHandleCreated(e);
                try
                {
                    _excludeFromCapture = SetWindowDisplayAffinity(this.Handle, WDA_EXCLUDEFROMCAPTURE);
                }
                catch
                {
                    _excludeFromCapture = false;
                }
            }

            public void ApplyLockBounds(Rectangle rect)
            {
                if (!_locked)
                {
                    HideLock();
                    return;
                }
                Bounds = rect;
                if (!Visible)
                {
                    ShowWindow(this.Handle, SW_SHOWNA);
                    Visible = true;
                }
                Invalidate();
            }

            public void HideLock()
            {
                if (Visible)
                {
                    Visible = false;
                    Bounds = new Rectangle(-32000, -32000, 10, 10);
                }
            }

            private void OnTick(object sender, EventArgs e)
            {
                if (!_locked)
                {
                    HideLock();
                    return;
                }
                int now = Environment.TickCount;
                int rem = unchecked(Interlocked.CompareExchange(ref _unlockAtTick, 0, 0) - now);
                if (rem <= 0 || InputArm.IsEmergencyStopped)
                {
                    _locked = false;
                    InputArm.ClearInputLock();
                    HideLock();
                    return;
                }

                Rectangle desired = new Rectangle(_x, _y, _w, _h);
                if (Bounds != desired)
                {
                    Bounds = desired;
                }
                if (!Visible)
                {
                    ShowWindow(this.Handle, SW_SHOWNA);
                    Visible = true;
                }

                int flashUntil = Interlocked.CompareExchange(ref _flashUntilTick, 0, 0);
                bool flashing = flashUntil != 0 && unchecked(flashUntil - now) > 0;
                if (flashing != _lastFlash)
                {
                    _lastFlash = flashing;
                    Invalidate();
                }
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                base.OnPaint(e);
                if (!_locked || ClientSize.Width <= 4 || ClientSize.Height <= 4) return;

                Graphics g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;

                int now = Environment.TickCount;
                int flashUntil = Interlocked.CompareExchange(ref _flashUntilTick, 0, 0);
                bool flashing = flashUntil != 0 && unchecked(flashUntil - now) > 0;

                Color borderColor = flashing ? Color.FromArgb(255, 59, 48) : Color.FromArgb(0, 229, 255);
                using (Pen borderPen = new Pen(borderColor, 3f))
                {
                    g.DrawRectangle(borderPen, 1.5f, 1.5f, ClientSize.Width - 3f, ClientSize.Height - 3f);
                }

                string label = flashing
                    ? "Region Locked • Esc to Stop"
                    : "Z-Vision Active • Esc to Stop";

                using (Font font = new Font("Segoe UI", 8.5f, FontStyle.Bold))
                {
                    SizeF textSize = g.MeasureString(label, font);
                    int pw = (int)Math.Ceiling(textSize.Width) + 16;
                    int ph = (int)Math.Ceiling(textSize.Height) + 6;
                    if (ClientSize.Width > pw + 12 && ClientSize.Height > ph + 12)
                    {
                        int px = Math.Max(8, (ClientSize.Width - pw) / 2);
                        int py = 8;
                        using (SolidBrush pillBg = new SolidBrush(flashing ? Color.FromArgb(180, 30, 30) : Color.FromArgb(12, 24, 40)))
                        using (Pen pillBorder = new Pen(borderColor, 1f))
                        using (SolidBrush textBrush = new SolidBrush(Color.White))
                        {
                            g.FillRectangle(pillBg, px, py, pw, ph);
                            g.DrawRectangle(pillBorder, px, py, pw, ph);
                            g.DrawString(label, font, textBrush, px + 8, py + 3);
                        }
                    }
                }
            }
        }
    }
}
