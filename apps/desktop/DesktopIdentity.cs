using System.Runtime.InteropServices;

namespace MinecraftCompanion;

internal static class DesktopIdentity
{
    public const string AppId = "MinecraftCompanion.Desktop";
    private static readonly Guid PropertyFormat = new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    private static readonly Guid StoreInterface = typeof(IPropertyStore).GUID;

    public static void ConfigureProcess() => Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(AppId));

    public static void ConfigureWindow(IntPtr handle, string launcher)
    {
        var iid = StoreInterface;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(handle, ref iid, out var store));
        try
        {
            SetString(store, 5, AppId);
            SetString(store, 2, "\"" + launcher + "\"");
            SetString(store, 4, "Minecraft Companion");
            SetString(store, 3, Path.Combine(Path.GetDirectoryName(launcher)!, "companion.ico"));
        }
        finally { Marshal.ReleaseComObject(store); }
    }

    public static void ConfigureShortcut(string filename)
    {
        var iid = StoreInterface;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(filename, IntPtr.Zero, 2, ref iid, out var store));
        try { SetString(store, 5, AppId); Marshal.ThrowExceptionForHR(store.Commit()); }
        finally { Marshal.ReleaseComObject(store); }
    }

    private static void SetString(IPropertyStore store, uint id, string text)
    {
        var key = new PropertyKey { Format = PropertyFormat, Id = id };
        var value = new PropertyValue { Type = 31, Pointer = Marshal.StringToCoTaskMemUni(text) };
        try { Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref value)); }
        finally { Marshal.FreeCoTaskMem(value.Pointer); }
    }

    [StructLayout(LayoutKind.Sequential)] private struct PropertyKey { public Guid Format; public uint Id; }
    [StructLayout(LayoutKind.Explicit, Size = 24)] private struct PropertyValue
    {
        [FieldOffset(0)] public ushort Type;
        [FieldOffset(8)] public IntPtr Pointer;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropertyValue value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropertyValue value);
        [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(IntPtr handle, ref Guid iid, out IPropertyStore store);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr context, uint flags, ref Guid iid, out IPropertyStore store);
}
