using System;
using System.Collections.Generic;
using System.Linq;

namespace JamesFrowen.SimpleWeb
{
    /// <summary>
    /// Represents the first HTTP websocket upgrade request received from a client.
    /// </summary>
    public class Request
    {
        private static readonly char[] LineSplitChars = { '\r', '\n' };
        private static readonly char[] HeaderSplitChars = { ':' };

        public string RequestLine;
        public Dictionary<string, string> Headers = new Dictionary<string, string>();

        public Request(string message)
        {
            string[] all = message.Split(LineSplitChars, StringSplitOptions.RemoveEmptyEntries);
            RequestLine = all.First();
            Headers = all.Skip(1)
                .Select(header => header.Split(HeaderSplitChars, 2, StringSplitOptions.RemoveEmptyEntries))
                .ToDictionary(split => split[0].Trim(), split => split[1].Trim());
        }
    }
}
