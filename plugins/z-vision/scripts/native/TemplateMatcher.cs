using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace ZVision.Native
{
    public static class TemplateMatcher
    {
        private sealed class TplHit
        {
            public double Score;
            public double Scale;
            public int X;
            public int Y;
            public int W;
            public int H;
        }

        /// <summary>
        /// Coarse-to-fine Normalized Cross Correlation (NCC) template search on grayscale buffers.
        /// </summary>
        public static Dictionary<string, object> FindTemplateNcc(Bitmap screen, Bitmap tpl, double minScore)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            if (screen == null || tpl == null || tpl.Width > screen.Width || tpl.Height > screen.Height || tpl.Width < 4 || tpl.Height < 4)
            {
                res["found"] = false;
                res["score"] = 0.0;
                return res;
            }

            int sw = screen.Width, sh = screen.Height;
            int tw = tpl.Width, th = tpl.Height;
            byte[] sg = ExtractGray(screen);
            byte[] tg = ExtractGray(tpl);

            double tMean = 0;
            for (int i = 0; i < tg.Length; i++) tMean += tg[i];
            tMean /= tg.Length;
            double tVar = 0;
            double[] tNorm = new double[tg.Length];
            for (int i = 0; i < tg.Length; i++)
            {
                double d = tg[i] - tMean;
                tNorm[i] = d;
                tVar += d * d;
            }
            if (tVar < 1e-6)
            {
                res["found"] = false;
                res["score"] = 0.0;
                return res;
            }

            int bestX = 0, bestY = 0;
            double bestScore = -1.0;

            int maxX = sw - tw;
            int maxY = sh - th;
            for (int y = 0; y <= maxY; y += 2)
            {
                for (int x = 0; x <= maxX; x += 2)
                {
                    double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 2);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestX = x;
                        bestY = y;
                    }
                }
            }

            int fineX0 = Math.Max(0, bestX - 3);
            int fineX1 = Math.Min(maxX, bestX + 3);
            int fineY0 = Math.Max(0, bestY - 3);
            int fineY1 = Math.Min(maxY, bestY + 3);
            bestScore = -1.0;
            for (int y = fineY0; y <= fineY1; y++)
            {
                for (int x = fineX0; x <= fineX1; x++)
                {
                    double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 1);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestX = x;
                        bestY = y;
                    }
                }
            }

            bool found = bestScore >= minScore;
            res["found"] = found;
            res["score"] = Math.Round(bestScore, 4);
            if (found)
            {
                res["x"] = bestX;
                res["y"] = bestY;
                res["width"] = tw;
                res["height"] = th;
                res["cx"] = bestX + tw / 2;
                res["cy"] = bestY + th / 2;
            }
            return res;
        }

        public static Dictionary<string, object> FindTemplateMulti(Bitmap screen, Bitmap tpl, double minScore, int originX, int originY, double[] scales, int maxMatches)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            List<object> emptyList = new List<object>();
            res["found"] = false;
            res["score"] = 0.0;
            res["matches"] = emptyList;
            if (screen == null || tpl == null || tpl.Width < 4 || tpl.Height < 4) return res;

            if (scales == null || scales.Length == 0) scales = new double[] { 1.0 };
            int scaleCount = Math.Min(5, scales.Length);
            int limit = Math.Max(1, Math.Min(16, maxMatches));
            int sw = screen.Width, sh = screen.Height;
            byte[] sg = ExtractGray(screen);

            List<TplHit> allHits = new List<TplHit>();
            for (int si = 0; si < scaleCount; si++)
            {
                double sc = Math.Max(0.5, Math.Min(2.0, scales[si]));
                bool needResize = Math.Abs(sc - 1.0) >= 0.01;
                Bitmap workTpl = tpl;
                bool disposeWork = false;
                if (needResize)
                {
                    int nw = Math.Max(4, (int)Math.Round(tpl.Width * sc));
                    int nh = Math.Max(4, (int)Math.Round(tpl.Height * sc));
                    if (nw > sw || nh > sh) continue;
                    Bitmap scaled = new Bitmap(nw, nh, PixelFormat.Format32bppArgb);
                    using (Graphics g = Graphics.FromImage(scaled))
                    {
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.DrawImage(tpl, 0, 0, nw, nh);
                    }
                    workTpl = scaled;
                    disposeWork = true;
                }

                try
                {
                    int tw = workTpl.Width, th = workTpl.Height;
                    if (tw > sw || th > sh || tw < 4 || th < 4) continue;

                    byte[] tg = ExtractGray(workTpl);
                    double tMean = 0;
                    for (int i = 0; i < tg.Length; i++) tMean += tg[i];
                    tMean /= tg.Length;
                    double tVar = 0;
                    double[] tNorm = new double[tg.Length];
                    for (int i = 0; i < tg.Length; i++)
                    {
                        double d = tg[i] - tMean;
                        tNorm[i] = d;
                        tVar += d * d;
                    }
                    if (tVar < 1e-6) continue;

                    int maxX = sw - tw;
                    int maxY = sh - th;
                    if (limit == 1)
                    {
                        int bestX = 0, bestY = 0;
                        double bestCoarse = -1.0;
                        for (int y = 0; y <= maxY; y += 2)
                        {
                            for (int x = 0; x <= maxX; x += 2)
                            {
                                double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 2);
                                if (score > bestCoarse)
                                {
                                    bestCoarse = score;
                                    bestX = x;
                                    bestY = y;
                                }
                            }
                        }

                        int fx0 = Math.Max(0, bestX - 3), fx1 = Math.Min(maxX, bestX + 3);
                        int fy0 = Math.Max(0, bestY - 3), fy1 = Math.Min(maxY, bestY + 3);
                        double bestFine = -1.0;
                        for (int y = fy0; y <= fy1; y++)
                        {
                            for (int x = fx0; x <= fx1; x++)
                            {
                                double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 1);
                                if (score > bestFine)
                                {
                                    bestFine = score;
                                    bestX = x;
                                    bestY = y;
                                }
                            }
                        }
                        if (bestFine >= minScore)
                        {
                            TplHit hit = new TplHit();
                            hit.Score = bestFine; hit.Scale = sc;
                            hit.X = bestX; hit.Y = bestY; hit.W = tw; hit.H = th;
                            allHits.Add(hit);
                        }
                    }
                    else
                    {
                        double coarseFloor = Math.Max(0.45, minScore - 0.12);
                        List<TplHit> coarse = new List<TplHit>();
                        for (int y = 0; y <= maxY; y += 2)
                        {
                            for (int x = 0; x <= maxX; x += 2)
                            {
                                double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 2);
                                if (score >= coarseFloor)
                                {
                                    TplHit cHit = new TplHit();
                                    cHit.Score = score; cHit.X = x; cHit.Y = y;
                                    coarse.Add(cHit);
                                }
                            }
                        }
                        coarse.Sort(delegate(TplHit a, TplHit b) { return b.Score.CompareTo(a.Score); });
                        int refineCap = Math.Min(64, coarse.Count);
                        for (int ci = 0; ci < refineCap; ci++)
                        {
                            int cx0 = coarse[ci].X, cy0 = coarse[ci].Y;
                            int fx0 = Math.Max(0, cx0 - 2), fx1 = Math.Min(maxX, cx0 + 2);
                            int fy0 = Math.Max(0, cy0 - 2), fy1 = Math.Min(maxY, cy0 + 2);
                            int bx = cx0, by = cy0;
                            double bs = -1.0;
                            for (int y = fy0; y <= fy1; y++)
                            {
                                for (int x = fx0; x <= fx1; x++)
                                {
                                    double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 1);
                                    if (score > bs) { bs = score; bx = x; by = y; }
                                }
                            }
                            if (bs >= minScore)
                            {
                                TplHit hit = new TplHit();
                                hit.Score = bs; hit.Scale = sc;
                                hit.X = bx; hit.Y = by; hit.W = tw; hit.H = th;
                                allHits.Add(hit);
                            }
                        }
                    }
                }
                finally
                {
                    if (disposeWork && workTpl != null) workTpl.Dispose();
                }
            }

            if (allHits.Count == 0) return res;
            allHits.Sort(delegate(TplHit a, TplHit b) { return b.Score.CompareTo(a.Score); });

            List<TplHit> kept = new List<TplHit>();
            for (int i = 0; i < allHits.Count && kept.Count < limit; i++)
            {
                TplHit cand = allHits[i];
                int ccx = cand.X + cand.W / 2;
                int ccy = cand.Y + cand.H / 2;
                bool suppressed = false;
                for (int k = 0; k < kept.Count; k++)
                {
                    TplHit ex = kept[k];
                    int ecx = ex.X + ex.W / 2;
                    int ecy = ex.Y + ex.H / 2;
                    if (Math.Abs(ccx - ecx) <= Math.Max(6, ex.W * 0.5) &&
                        Math.Abs(ccy - ecy) <= Math.Max(6, ex.H * 0.5))
                    {
                        suppressed = true;
                        break;
                    }
                }
                if (!suppressed) kept.Add(cand);
            }

            if (kept.Count == 0) return res;
            List<object> matchList = new List<object>();
            for (int i = 0; i < kept.Count; i++)
            {
                TplHit h = kept[i];
                int hcx = h.X + h.W / 2;
                int hcy = h.Y + h.H / 2;
                Dictionary<string, object> md = new Dictionary<string, object>(StringComparer.Ordinal);
                md["score"] = Math.Round(h.Score, 4);
                md["scale"] = Math.Round(h.Scale, 3);
                md["x"] = h.X;
                md["y"] = h.Y;
                md["width"] = h.W;
                md["height"] = h.H;
                md["cx"] = hcx;
                md["cy"] = hcy;
                md["screen_cx"] = originX + hcx;
                md["screen_cy"] = originY + hcy;
                matchList.Add(md);
            }

            TplHit best = kept[0];
            res["found"] = true;
            res["score"] = Math.Round(best.Score, 4);
            res["scale"] = Math.Round(best.Scale, 3);
            res["x"] = best.X;
            res["y"] = best.Y;
            res["width"] = best.W;
            res["height"] = best.H;
            res["cx"] = best.X + best.W / 2;
            res["cy"] = best.Y + best.H / 2;
            res["screen_cx"] = originX + best.X + best.W / 2;
            res["screen_cy"] = originY + best.Y + best.H / 2;
            res["matches"] = matchList;
            return res;
        }

        private static byte[] ExtractGray(Bitmap bmp)
        {
            int w = bmp.Width, h = bmp.Height;
            byte[] gray = new byte[w * h];
            BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] buf = new byte[stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);
                for (int y = 0; y < h; y++)
                {
                    int row = y * stride;
                    int outRow = y * w;
                    for (int x = 0; x < w; x++)
                    {
                        int px = row + x * 4;
                        gray[outRow + x] = (byte)((54 * buf[px + 2] + 183 * buf[px + 1] + 19 * buf[px]) >> 8);
                    }
                }
            }
            finally
            {
                bmp.UnlockBits(data);
            }
            return gray;
        }

        private static double ComputePatchNcc(byte[] sg, int sw, int px, int py, double[] tNorm, int tw, int th, double tVar, int step)
        {
            double sMean = 0;
            int count = 0;
            for (int ty = 0; ty < th; ty += step)
            {
                int sRow = (py + ty) * sw + px;
                for (int tx = 0; tx < tw; tx += step)
                {
                    sMean += sg[sRow + tx];
                    count++;
                }
            }
            if (count == 0) return -1.0;
            sMean /= count;

            double num = 0, sVar = 0, tSubVar = 0;
            for (int ty = 0; ty < th; ty += step)
            {
                int sRow = (py + ty) * sw + px;
                int tRow = ty * tw;
                for (int tx = 0; tx < tw; tx += step)
                {
                    double sd = sg[sRow + tx] - sMean;
                    double td = tNorm[tRow + tx];
                    num += sd * td;
                    sVar += sd * sd;
                    tSubVar += td * td;
                }
            }
            double denom = Math.Sqrt(sVar * (step == 1 ? tVar : tSubVar));
            return denom < 1e-6 ? 0.0 : (num / denom);
        }

        public static List<object> BuildSomMarks(Bitmap bmp, Dictionary<string, object> ocrResult, int originX, int originY, int maxMarks)
        {
            List<object> marks = new List<object>();
            if (bmp == null || bmp.Width < 4 || bmp.Height < 4) return marks;
            int cap = Math.Max(1, Math.Min(40, maxMarks <= 0 ? 30 : maxMarks));

            if (ocrResult != null && ocrResult.ContainsKey("lines"))
            {
                List<object> lines = ocrResult["lines"] as List<object>;
                if (lines != null)
                {
                    for (int i = 0; i < lines.Count && marks.Count < cap; i++)
                    {
                        Dictionary<string, object> lDict = lines[i] as Dictionary<string, object>;
                        if (lDict == null) continue;
                        List<object> b = lDict.ContainsKey("bounds") ? (lDict["bounds"] as List<object>) : null;
                        if (b == null || b.Count != 4) continue;
                        int x = Convert.ToInt32(b[0]);
                        int y = Convert.ToInt32(b[1]);
                        int w = Convert.ToInt32(b[2]);
                        int h = Convert.ToInt32(b[3]);
                        if (w < 8 || h < 8) continue;

                        Dictionary<string, object> mk = new Dictionary<string, object>(StringComparer.Ordinal);
                        mk["id"] = marks.Count + 1;
                        mk["label"] = Convert.ToString(lDict.ContainsKey("text") ? lDict["text"] : "");
                        mk["rect"] = new List<object> { x, y, w, h };
                        mk["cx"] = x + w / 2;
                        mk["cy"] = y + h / 2;
                        mk["source"] = "ocr";
                        marks.Add(mk);
                    }
                }
            }

            if (marks.Count < cap)
            {
                int gw = Math.Min(48, bmp.Width);
                int gh = Math.Min(36, bmp.Height);
                byte[] cellR = new byte[gw * gh];
                byte[] cellG = new byte[gw * gh];
                byte[] cellB = new byte[gw * gh];
                BitmapData data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                try
                {
                    int stride = Math.Abs(data.Stride);
                    byte[] raw = new byte[stride * bmp.Height];
                    Marshal.Copy(data.Scan0, raw, 0, raw.Length);
                    for (int gy = 0; gy < gh; gy++)
                    {
                        int py = Math.Min(bmp.Height - 1, (int)((gy + 0.5) * bmp.Height / gh));
                        int rowOff = py * stride;
                        for (int gx = 0; gx < gw; gx++)
                        {
                            int px = Math.Min(bmp.Width - 1, (int)((gx + 0.5) * bmp.Width / gw));
                            int off = rowOff + px * 4;
                            int idx = gy * gw + gx;
                            cellR[idx] = raw[off + 2];
                            cellG[idx] = raw[off + 1];
                            cellB[idx] = raw[off];
                        }
                    }
                }
                finally
                {
                    bmp.UnlockBits(data);
                }

                long sumR = 0, sumG = 0, sumB = 0;
                int borderCnt = 0;
                for (int gx = 0; gx < gw; gx++)
                {
                    sumR += cellR[gx] + cellR[(gh - 1) * gw + gx];
                    sumG += cellG[gx] + cellG[(gh - 1) * gw + gx];
                    sumB += cellB[gx] + cellB[(gh - 1) * gw + gx];
                    borderCnt += 2;
                }
                int bgR = (int)(sumR / Math.Max(1, borderCnt));
                int bgG = (int)(sumG / Math.Max(1, borderCnt));
                int bgB = (int)(sumB / Math.Max(1, borderCnt));

                bool[] fg = new bool[gw * gh];
                for (int i = 0; i < fg.Length; i++)
                {
                    int diff = Math.Abs(cellR[i] - bgR) + Math.Abs(cellG[i] - bgG) + Math.Abs(cellB[i] - bgB);
                    fg[i] = diff > 42;
                }

                bool[] seen = new bool[gw * gh];
                int[] dx = new int[] { 1, -1, 0, 0 };
                int[] dy = new int[] { 0, 0, 1, -1 };
                double maxArea = bmp.Width * bmp.Height * 0.70;

                for (int start = 0; start < fg.Length && marks.Count < cap; start++)
                {
                    if (!fg[start] || seen[start]) continue;
                    Queue<int> q = new Queue<int>();
                    q.Enqueue(start);
                    seen[start] = true;
                    int minGx = gw, maxGx = -1, minGy = gh, maxGy = -1;
                    while (q.Count > 0)
                    {
                        int cur = q.Dequeue();
                        int cy = cur / gw;
                        int cx = cur % gw;
                        if (cx < minGx) minGx = cx;
                        if (cx > maxGx) maxGx = cx;
                        if (cy < minGy) minGy = cy;
                        if (cy > maxGy) maxGy = cy;
                        for (int k = 0; k < 4; k++)
                        {
                            int nx = cx + dx[k], ny = cy + dy[k];
                            if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
                            int nIdx = ny * gw + nx;
                            if (fg[nIdx] && !seen[nIdx])
                            {
                                seen[nIdx] = true;
                                q.Enqueue(nIdx);
                            }
                        }
                    }

                    int bx = originX + (int)Math.Floor((double)minGx * bmp.Width / gw);
                    int by = originY + (int)Math.Floor((double)minGy * bmp.Height / gh);
                    int bx2 = originX + (int)Math.Ceiling((double)(maxGx + 1) * bmp.Width / gw);
                    int by2 = originY + (int)Math.Ceiling((double)(maxGy + 1) * bmp.Height / gh);
                    int bw = Math.Max(1, bx2 - bx);
                    int bh = Math.Max(1, by2 - by);
                    if (bw < 16 || bh < 14 || (bw * (double)bh) > maxArea) continue;

                    bool overlapsOcr = false;
                    for (int m = 0; m < marks.Count; m++)
                    {
                        Dictionary<string, object> ex = marks[m] as Dictionary<string, object>;
                        if (ex == null) continue;
                        int exCx = Convert.ToInt32(ex["cx"]);
                        int exCy = Convert.ToInt32(ex["cy"]);
                        if (exCx >= bx && exCx <= bx + bw && exCy >= by && exCy <= by + bh)
                        {
                            overlapsOcr = true;
                            break;
                        }
                    }
                    if (overlapsOcr) continue;

                    Dictionary<string, object> mk = new Dictionary<string, object>(StringComparer.Ordinal);
                    mk["id"] = marks.Count + 1;
                    mk["label"] = "region";
                    mk["rect"] = new List<object> { bx, by, bw, bh };
                    mk["cx"] = bx + bw / 2;
                    mk["cy"] = by + bh / 2;
                    mk["source"] = "visual";
                    marks.Add(mk);
                }
            }
            return marks;
        }

        public static void RenderSomOverlay(Bitmap scaledBmp, List<object> somMarks, int capW, int capH, int originX, int originY)
        {
            if (scaledBmp == null || somMarks == null || somMarks.Count == 0 || capW <= 0 || capH <= 0) return;
            double sx = (double)scaledBmp.Width / capW;
            double sy = (double)scaledBmp.Height / capH;

            using (Graphics g = Graphics.FromImage(scaledBmp))
            using (Pen ocrPen = new Pen(Color.FromArgb(255, 107, 0), 2f))
            using (Pen visPen = new Pen(Color.FromArgb(0, 194, 255), 2f))
            using (SolidBrush ocrBg = new SolidBrush(Color.FromArgb(220, 255, 107, 0)))
            using (SolidBrush visBg = new SolidBrush(Color.FromArgb(220, 0, 140, 220)))
            using (SolidBrush fg = new SolidBrush(Color.White))
            using (Font font = new Font("Segoe UI", 8f, FontStyle.Bold))
            {
                for (int i = 0; i < somMarks.Count; i++)
                {
                    Dictionary<string, object> mk = somMarks[i] as Dictionary<string, object>;
                    if (mk == null) continue;
                    List<object> b = mk.ContainsKey("rect") ? (mk["rect"] as List<object>) : null;
                    if (b == null || b.Count != 4) continue;

                    int rx = (int)Math.Round((Convert.ToInt32(b[0]) - originX) * sx);
                    int ry = (int)Math.Round((Convert.ToInt32(b[1]) - originY) * sy);
                    int rw = Math.Max(4, (int)Math.Round(Convert.ToInt32(b[2]) * sx));
                    int rh = Math.Max(4, (int)Math.Round(Convert.ToInt32(b[3]) * sy));
                    bool isOcr = string.Equals(Convert.ToString(mk["source"]), "ocr", StringComparison.Ordinal);

                    g.DrawRectangle(isOcr ? ocrPen : visPen, rx, ry, rw, rh);
                    string badge = "[" + Convert.ToInt32(mk["id"]) + "]";
                    SizeF sz = g.MeasureString(badge, font);
                    int pw = (int)Math.Ceiling(sz.Width) + 4;
                    int ph = (int)Math.Ceiling(sz.Height);
                    int px = Math.Max(0, Math.Min(scaledBmp.Width - pw, rx));
                    int py = Math.Max(0, Math.Min(scaledBmp.Height - ph, ry - ph + 2));
                    g.FillRectangle(isOcr ? ocrBg : visBg, px, py, pw, ph);
                    g.DrawString(badge, font, fg, px + 2, py);
                }
            }
        }
    }
}
