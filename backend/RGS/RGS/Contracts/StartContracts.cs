namespace RGS.Contracts;

public sealed record StartRequest(
    string? PlayerToken, 
    int FunMode, 
    string? LanguageId,
    string? Client,
    string? CurrencyId);

public sealed record StartResponse(
    int StatusCode,
    string Message,
    StartGameResponse? Data);

