using MattPong.Realtime;
using Microsoft.AspNetCore.SignalR;

namespace MattPong.Game;

public sealed class GameLoopService(RoomManager rooms, IHubContext<GameHub> hub) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(16.6667);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Tick);
        var last = DateTimeOffset.UtcNow;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTimeOffset.UtcNow;
            var dt = Math.Clamp((float)(now - last).TotalSeconds, 0f, 0.05f);
            last = now;

            foreach (var room in rooms.Rooms)
            {
                Step(room, dt);
                await hub.Clients.Group(room.Code).SendAsync("State", Snapshot(room), stoppingToken);
            }
        }
    }

    private static object Snapshot(GameRoom room) => new
    {
        room.Code,
        mode = room.Mode.ToString().ToLowerInvariant(),
        waiting = room.Mode == GameMode.Online && room.RightConnectionId is null,
        leftY = room.State.LeftY,
        rightY = room.State.RightY,
        ballX = room.State.BallX,
        ballY = room.State.BallY,
        leftScore = room.State.LeftScore,
        rightScore = room.State.RightScore
    };

    private static void Step(GameRoom room, float dt)
    {
        lock (room.SyncRoot)
        {
            var s = room.State;
            if (!s.Running) return;

            const float paddleSpeed = 1050f;
            s.LeftY = MoveToward(s.LeftY, room.LeftTargetY, paddleSpeed * dt);

            if (room.Mode == GameMode.Cpu)
            {
                var cpuTarget = s.BallVx > 0 ? s.BallY : GameState.Height / 2;
                s.RightY = MoveToward(s.RightY, cpuTarget, 760f * dt);
            }
            else
            {
                s.RightY = MoveToward(s.RightY, room.RightTargetY, paddleSpeed * dt);
            }

            var halfPaddle = GameState.PaddleHeight / 2;
            s.LeftY = Math.Clamp(s.LeftY, halfPaddle, GameState.Height - halfPaddle);
            s.RightY = Math.Clamp(s.RightY, halfPaddle, GameState.Height - halfPaddle);

            s.BallX += s.BallVx * dt;
            s.BallY += s.BallVy * dt;

            if (s.BallY - GameState.BallRadius <= 0 && s.BallVy < 0 ||
                s.BallY + GameState.BallRadius >= GameState.Height && s.BallVy > 0)
            {
                s.BallVy = -s.BallVy;
                s.BallY = Math.Clamp(s.BallY, GameState.BallRadius, GameState.Height - GameState.BallRadius);
            }

            const float leftX = 80f;
            const float rightX = GameState.Width - 80f;

            if (s.BallVx < 0 && IntersectsPaddle(s.BallX, s.BallY, leftX, s.LeftY))
                BounceFromPaddle(s, true, s.LeftY);
            else if (s.BallVx > 0 && IntersectsPaddle(s.BallX, s.BallY, rightX, s.RightY))
                BounceFromPaddle(s, false, s.RightY);

            if (s.BallX < -GameState.BallRadius)
            {
                s.RightScore++;
                s.ResetBall(1);
            }
            else if (s.BallX > GameState.Width + GameState.BallRadius)
            {
                s.LeftScore++;
                s.ResetBall(-1);
            }
        }
    }

    private static bool IntersectsPaddle(float bx, float by, float px, float py)
    {
        var halfW = GameState.PaddleWidth / 2 + GameState.BallRadius;
        var halfH = GameState.PaddleHeight / 2 + GameState.BallRadius;
        return Math.Abs(bx - px) <= halfW && Math.Abs(by - py) <= halfH;
    }

    private static void BounceFromPaddle(GameState s, bool left, float paddleY)
    {
        var offset = Math.Clamp((s.BallY - paddleY) / (GameState.PaddleHeight / 2), -1f, 1f);
        var speed = Math.Min(MathF.Sqrt(s.BallVx * s.BallVx + s.BallVy * s.BallVy) * 1.045f, 1250f);
        var angle = offset * 0.9f;
        var x = MathF.Cos(angle) * speed * (left ? 1 : -1);
        var y = MathF.Sin(angle) * speed;
        s.BallVx = x;
        s.BallVy = y;
        s.BallX = left ? 80f + GameState.PaddleWidth / 2 + GameState.BallRadius + 1 : GameState.Width - 80f - GameState.PaddleWidth / 2 - GameState.BallRadius - 1;
    }

    private static float MoveToward(float current, float target, float maxDelta)
    {
        if (Math.Abs(target - current) <= maxDelta) return target;
        return current + Math.Sign(target - current) * maxDelta;
    }
}
