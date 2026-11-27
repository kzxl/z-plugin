using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace ZVision.Native
{
    public static class JsonMini
    {
        public static object Parse(string json)
        {
            if (json == null) return null;
            int idx = 0;
            return ParseValue(json, ref idx);
        }

        public static string Stringify(object value)
        {
            StringBuilder sb = new StringBuilder(256);
            WriteValue(sb, value);
            return sb.ToString();
        }

        public static string GetString(Dictionary<string, object> dict, string key, string fallback)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return fallback;
            return Convert.ToString(dict[key], CultureInfo.InvariantCulture);
        }

        public static int GetInt(Dictionary<string, object> dict, string key, int fallback)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return fallback;
            object v = dict[key];
            if (v is long) return (int)(long)v;
            if (v is double) return (int)Math.Round((double)v);
            if (v is int) return (int)v;
            int parsed;
            if (int.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                return parsed;
            return fallback;
        }

        public static long GetLong(Dictionary<string, object> dict, string key, long fallback)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return fallback;
            object v = dict[key];
            if (v is long) return (long)v;
            if (v is int) return (long)(int)v;
            if (v is double) return (long)Math.Round((double)v);
            long parsed;
            if (long.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                return parsed;
            return fallback;
        }

        public static double GetDouble(Dictionary<string, object> dict, string key, double fallback)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return fallback;
            object v = dict[key];
            if (v is double) return (double)v;
            if (v is long) return (double)(long)v;
            if (v is int) return (double)(int)v;
            double parsed;
            if (double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
                return parsed;
            return fallback;
        }

        public static bool GetBool(Dictionary<string, object> dict, string key, bool fallback)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return fallback;
            object v = dict[key];
            if (v is bool) return (bool)v;
            string s = Convert.ToString(v, CultureInfo.InvariantCulture);
            if (string.Equals(s, "true", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(s, "false", StringComparison.OrdinalIgnoreCase)) return false;
            return fallback;
        }

        public static Dictionary<string, object> GetDict(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key)) return null;
            return dict[key] as Dictionary<string, object>;
        }

        public static List<object> GetList(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key)) return null;
            return dict[key] as List<object>;
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length)
            {
                char c = s[i];
                if (c == ' ' || c == '\t' || c == '\r' || c == '\n') i++;
                else break;
            }
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) return null;
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't')
            {
                if (i + 4 <= s.Length && s.Substring(i, 4) == "true") { i += 4; return true; }
                throw new FormatException("Invalid literal at " + i);
            }
            if (c == 'f')
            {
                if (i + 5 <= s.Length && s.Substring(i, 5) == "false") { i += 5; return false; }
                throw new FormatException("Invalid literal at " + i);
            }
            if (c == 'n')
            {
                if (i + 4 <= s.Length && s.Substring(i, 4) == "null") { i += 4; return null; }
                throw new FormatException("Invalid literal at " + i);
            }
            if (c == '-' || (c >= '0' && c <= '9')) return ParseNumber(s, ref i);
            throw new FormatException("Unexpected char '" + c + "' at " + i);
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            Dictionary<string, object> obj = new Dictionary<string, object>(StringComparer.Ordinal);
            i++; // '{'
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return obj; }
            while (i < s.Length)
            {
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new FormatException("Expected string key at " + i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("Expected ':' at " + i);
                i++;
                object val = ParseValue(s, ref i);
                obj[key] = val;
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return obj; }
                throw new FormatException("Expected ',' or '}' at " + i);
            }
            throw new FormatException("Unterminated JSON object");
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            List<object> list = new List<object>();
            i++; // '['
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }
            while (i < s.Length)
            {
                list.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return list; }
                throw new FormatException("Expected ',' or ']' at " + i);
            }
            throw new FormatException("Unterminated JSON array");
        }

        private static string ParseString(string s, ref int i)
        {
            i++; // '"'
            StringBuilder sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c == '\\')
                {
                    if (i >= s.Length) throw new FormatException("Unterminated escape");
                    char esc = s[i++];
                    switch (esc)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw new FormatException("Invalid unicode escape");
                            int code = int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                            sb.Append((char)code);
                            i += 4;
                            break;
                        default:
                            sb.Append(esc);
                            break;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            throw new FormatException("Unterminated JSON string");
        }

        private static object ParseNumber(string s, ref int i)
        {
            int start = i;
            bool isFloat = false;
            if (s[i] == '-') i++;
            while (i < s.Length)
            {
                char c = s[i];
                if (c >= '0' && c <= '9') { i++; continue; }
                if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-')
                {
                    if (c == '-' && i == start) break;
                    isFloat = true;
                    i++;
                    continue;
                }
                break;
            }
            string raw = s.Substring(start, i - start);
            if (!isFloat)
            {
                long lv;
                if (long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out lv)) return lv;
            }
            return double.Parse(raw, NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        private static void WriteValue(StringBuilder sb, object val)
        {
            if (val == null) { sb.Append("null"); return; }
            if (val is bool) { sb.Append(((bool)val) ? "true" : "false"); return; }
            if (val is string) { WriteString(sb, (string)val); return; }
            if (val is int) { sb.Append(((int)val).ToString(CultureInfo.InvariantCulture)); return; }
            if (val is long) { sb.Append(((long)val).ToString(CultureInfo.InvariantCulture)); return; }
            if (val is ulong) { sb.Append(((ulong)val).ToString(CultureInfo.InvariantCulture)); return; }
            if (val is float)
            {
                float fv = (float)val;
                if (float.IsNaN(fv) || float.IsInfinity(fv)) sb.Append("null");
                else sb.Append(fv.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            if (val is double)
            {
                double dv = (double)val;
                if (double.IsNaN(dv) || double.IsInfinity(dv)) sb.Append("null");
                else sb.Append(dv.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            IDictionary dict = val as IDictionary;
            if (dict != null)
            {
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry entry in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, Convert.ToString(entry.Key, CultureInfo.InvariantCulture));
                    sb.Append(':');
                    WriteValue(sb, entry.Value);
                }
                sb.Append('}');
                return;
            }
            IEnumerable arr = val as IEnumerable;
            if (arr != null)
            {
                sb.Append('[');
                bool first = true;
                foreach (object item in arr)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteValue(sb, item);
                }
                sb.Append(']');
                return;
            }
            WriteString(sb, Convert.ToString(val, CultureInfo.InvariantCulture));
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32)
                        {
                            sb.Append("\\u");
                            sb.Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
