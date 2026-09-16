using System.Collections.Concurrent;

namespace MattPong.Game;

public enum GameMode { Cpu, Online }

public sealed class GameRoom
{
    public string Code { get; init; } = string.Empty;
    public GameMode Mode { get; init; }
    public GameState State { get; } = new();
    public string? LeftConnectionId { get; set; }
    public string? RightConnectionId { get; set; }
    public float LeftTargetY { get; set; } = GameState.Height / 2;
    public float RightTargetY { get; set; } = GameState.Height / 2;
    public DateTimeOffset LastActivityUtc { get; set; } = DateTimeOffset.UtcNow;
    public object SyncRoot { get; } = new();
}

public sealed class RoomManager
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);

    public IEnumerable<GameRoom> Rooms => _rooms.Values;

    public GameRoom CreateCpuRoom(string connectionId)
    {
        var room = new GameRoom
        {
            Code = CreateCode(),
            Mode = GameMode.Cpu,
            LeftConnectionId = connectionId
        };
        room.State.Running = true;
        _rooms[room.Code] = room;
        return room;
    }

    public GameRoom CreateOnlineRoom(string connectionId)
    {
        var room = new GameRoom
        {
            Code = CreateCode(),
            Mode = GameMode.Online,
            LeftConnectionId = connectionId
        };
        _rooms[room.Code] = room;
        return room;
    }

    public GameRoom? Join(string code, string connectionId)
    {
        if (!_rooms.TryGetValue(code.Trim(), out var room) || room.Mode != GameMode.Online)
            return null;

        lock (room.SyncRoot)
        {
            if (room.RightConnectionId is not null || room.LeftConnectionId == connectionId)
                return null;
            room.RightConnectionId = connectionId;
            room.State.Running = true;
            room.LastActivityUtc = DateTimeOffset.UtcNow;
            return room;
        }
    }

    public GameRoom? FindByConnection(string connectionId) =>
        _rooms.Values.FirstOrDefault(r => r.LeftConnectionId == connectionId || r.RightConnectionId == connectionId);

    public void RemoveConnection(string connectionId)
    {
        var room = FindByConnection(connectionId);
        if (room is null) return;
        lock (room.SyncRoot)
        {
            if (room.LeftConnectionId == connectionId) room.LeftConnectionId = null;
            if (room.RightConnectionId == connectionId) room.RightConnectionId = null;
            room.State.Running = false;
        }
        if (room.LeftConnectionId is null && room.RightConnectionId is null)
            _rooms.TryRemove(room.Code, out _);
    }

    private string CreateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        string code;
        do code = new string(Enumerable.Range(0, 6).Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
        while (_rooms.ContainsKey(code));
        return code;
    }
}
