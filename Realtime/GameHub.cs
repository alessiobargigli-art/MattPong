using MattPong.Game;
using Microsoft.AspNetCore.SignalR;

namespace MattPong.Realtime;

public sealed class GameHub(RoomManager rooms) : Hub
{
    public async Task<object> CreateCpu()
    {
        var room = rooms.CreateCpuRoom(Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        return new { room.Code, side = "left", mode = "cpu" };
    }

    public async Task<object> CreateOnline()
    {
        var room = rooms.CreateOnlineRoom(Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        return new { room.Code, side = "left", mode = "online" };
    }

    public async Task<object> JoinRoom(string code)
    {
        var room = rooms.Join(code, Context.ConnectionId)
            ?? throw new HubException("Stanza non trovata, già piena o codice non valido.");

        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        await Clients.Group(room.Code).SendAsync("RoomReady");
        return new { room.Code, side = "right", mode = "online" };
    }

    public Task Move(float normalizedY)
    {
        var room = rooms.FindByConnection(Context.ConnectionId);
        if (room is null) return Task.CompletedTask;

        normalizedY = Math.Clamp(normalizedY, 0f, 1f);
        var target = normalizedY * GameState.Height;
        lock (room.SyncRoot)
        {
            if (room.LeftConnectionId == Context.ConnectionId) room.LeftTargetY = target;
            else if (room.RightConnectionId == Context.ConnectionId) room.RightTargetY = target;
            room.LastActivityUtc = DateTimeOffset.UtcNow;
        }
        return Task.CompletedTask;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = rooms.FindByConnection(Context.ConnectionId);
        if (room is not null)
            await Clients.Group(room.Code).SendAsync("OpponentLeft");
        rooms.RemoveConnection(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
