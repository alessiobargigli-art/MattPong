namespace MattPong.Game;

public sealed class GameState
{
    public const float Width = 1600;
    public const float Height = 900;
    public const float PaddleWidth = 28;
    public const float PaddleHeight = 180;
    public const float BallRadius = 18;

    public float LeftY { get; set; } = Height / 2;
    public float RightY { get; set; } = Height / 2;
    public float BallX { get; set; } = Width / 2;
    public float BallY { get; set; } = Height / 2;
    public float BallVx { get; set; } = 640;
    public float BallVy { get; set; } = 260;
    public int LeftScore { get; set; }
    public int RightScore { get; set; }
    public bool Running { get; set; }

    public void ResetBall(int direction)
    {
        BallX = Width / 2;
        BallY = Height / 2;
        BallVx = 640 * direction;
        BallVy = Random.Shared.Next(-320, 321);
    }
}
