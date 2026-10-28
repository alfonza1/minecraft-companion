using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("Minecraft Companion")]
[assembly: AssemblyProduct("Minecraft Companion")]

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string root = Path.GetFullPath(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "project-path.txt")).Trim());
            string script = Path.Combine(root, "scripts", "Desktop.ps1");
            if (!File.Exists(script)) throw new IOException("The working copy has moved. Reinstall its desktop launcher.");
            if (script.Contains("\"")) throw new IOException("Invalid project path.");
            using (Process process = Process.Start(new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            })) { process.WaitForExit(); }
        }
        catch (Exception error) { MessageBox.Show(error.Message, "Minecraft Companion", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
