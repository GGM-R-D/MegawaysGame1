namespace RGS.Contracts;

// Comprehensive RGS Response Models matching the API specification

public sealed record RgsApiResponse<T>(
    int StatusCode,
    string Message,
    T? Data = default);

// Start Game Response
public sealed record StartGameResponse(
    PlayerInfo Player,
    ClientInfo Client,
    CurrencyInfo Currency,
    GameInfo Game);

public sealed record PlayerInfo(
    string SessionId,
    string Id,
    decimal Balance);

public sealed record ClientInfo(
    string Type,
    string Ip,
    CountryInfo Country);

public sealed record CountryInfo(
    string Code,
    string Name);

public sealed record CurrencyInfo(
    string Symbol,
    string IsoCode,
    string Name,
    int Decimals,
    CurrencySeparators Separator);

public sealed record CurrencySeparators(
    string Decimal,
    string Thousand);

public sealed record GameInfo(
    decimal Rtp,
    int Mode,
    BetInfo Bet,
    bool FunMode,
    decimal MaxWinCap,
    GameConfig Config,
    FreeSpinsInfo FreeSpins,
    PromoFreeSpinsInfo PromoFreeSpins,
    LastPlayInfo? LastPlay,
    FeatureInfo? Feature);

public sealed record BetInfo(
    int Default,
    IReadOnlyList<decimal> Levels);

public sealed record GameConfig(
    object? StartScreen,
    GameSettings Settings);

public sealed record GameSettings(
    string IsAutoplay,
    string IsSlamStop,
    string IsBuyFeatures,
    string IsTurboSpin,
    string IsRealityCheck,
    string MinSpin,
    string MaxSpin);

public sealed record FreeSpinsInfo(
    int Amount,
    int Left,
    decimal BetValue,
    decimal RoundWin,
    decimal TotalWin,
    decimal TotalBet);

public sealed record PromoFreeSpinsInfo(
    int Amount,
    int Left,
    decimal BetValue,
    bool IsPromotion,
    decimal TotalWin,
    decimal TotalBet);

public sealed record LastPlayInfo(
    BetLevelInfo BetLevel,
    object? Results);

public sealed record BetLevelInfo(
    int Index,
    decimal Value);

public sealed record FeatureInfo(
    string Name,
    string Type);

// Play Game Response
public sealed record PlayGameResponse(
    PlayerPlayInfo Player,
    GamePlayInfo Game,
    FreeSpinsPlayInfo FreeSpins,
    PromoFreeSpinsPlayInfo PromoFreeSpins,
    IReadOnlyList<JackpotInfo> Jackpots,
    FeaturePlayInfo Feature);

public sealed record PlayerPlayInfo(
    string SessionId,
    string RoundId,
    TransactionInfo Transaction,
    decimal PrevBalance,
    decimal Balance,
    decimal Bet,
    decimal Win,
    string CurrencyId);

public sealed record TransactionInfo(
    string Withdraw,
    string Deposit);

public sealed record GamePlayInfo(
    object Results,
    int Mode,
    MaxWinCapInfo MaxWinCap);

public sealed record MaxWinCapInfo(
    bool Achieved,
    decimal Value,
    decimal RealWin);

public sealed record FreeSpinsPlayInfo(
    int Amount,
    int Left,
    decimal BetValue,
    bool IsPromotion,
    decimal RoundWin,
    decimal TotalWin,
    decimal TotalBet,
    int Won);

public sealed record PromoFreeSpinsPlayInfo(
    int Amount,
    int Left,
    decimal BetValue,
    int Level,
    decimal TotalWin,
    decimal TotalBet);

public sealed record JackpotInfo(
    string Id,
    decimal Contribution,
    decimal Payout,
    bool IsWon,
    string? TicketId);

public sealed record FeaturePlayInfo(
    string Name,
    string Type,
    int IsClosure);

// Balance Response
public sealed record BalanceResponse(
    decimal Balance);

