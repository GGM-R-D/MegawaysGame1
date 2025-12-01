namespace RGS.Contracts;

public sealed record StartRequest(string? PlayerToken, int FunMode, string Locale, IDictionary<string, object>? ClientMeta);

public sealed record StartResponse(
    string SessionId,
    string GameId,
    string OperatorId,
    int FunMode,
    DateTimeOffset CreatedAt,
    string TimeSignature,
    string ThemeId);

