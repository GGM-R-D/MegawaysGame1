using System.Globalization;
using System.Linq;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using GameEngine;
using GameEngine.Configuration;
using GameEngine.Play;
using GameEngine.Services;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using RGS.Contracts;
using RGS.Services;
using RNGClient;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Register services
builder.Services.AddSingleton<SessionManager>();
builder.Services.AddSingleton<BalanceService>();
builder.Services.AddSingleton<CurrencyService>();
builder.Services.AddSingleton<ITimeService, TimeService>();

// Configure Game Configuration Loader
var configDirectory = Path.GetFullPath(
    Path.Combine(builder.Environment.ContentRootPath, 
        builder.Configuration["GameEngine:ConfigurationDirectory"] ?? "..\\..\\GameEngineHost\\configs"));
var manifestPath = Path.GetFullPath(
    Path.Combine(builder.Environment.ContentRootPath,
        builder.Configuration["GameEngine:ControlProgramManifest"] ?? "..\\..\\GameEngineHost\\configs\\control-program-manifest.json"));

builder.Services.AddGameEngine(configDirectory, manifestPath);

// Register RNG Client (required by SpinHandler)
var rngBaseUrl = builder.Configuration["Rng:BaseUrl"] ?? "http://localhost:5102/pools";
builder.Services.AddHttpClient("rng", client => client.BaseAddress = new Uri(rngBaseUrl));
builder.Services.AddSingleton<IRngClient>(sp =>
{
    var factory = sp.GetRequiredService<IHttpClientFactory>();
    var options = new RngClientOptions(rngBaseUrl);
    return new RngClient(options, factory.CreateClient("rng"));
});

// Register GameConfigService after GameConfigurationLoader is registered
builder.Services.AddSingleton<GameConfigService>(sp =>
{
    var configLoader = sp.GetRequiredService<GameEngine.Configuration.GameConfigurationLoader>();
    return new GameConfigService(configLoader);
});

// Configure JSON options for both requests and responses (used when RGS calls the engine)
builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new MoneyJsonConverter());
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

// Configure JSON options for minimal API request binding
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new MoneyJsonConverter());
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var engineBaseUrl = builder.Configuration["Engine:BaseUrl"] ?? "http://localhost:5101";
builder.Services.AddHttpClient<IEngineClient, EngineHttpClient>(client =>
{
    client.BaseAddress = new Uri(engineBaseUrl);
});

var app = builder.Build();
var logger = app.Logger;

// Forward headers for IP detection
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("AllowFrontend");

// Error code constants
const int STATUS_OK = 6000;
const int STATUS_BAD_REQUEST = 6001;
const int STATUS_UNAUTHORIZED = 6002;

// Helper to get client IP
static string GetClientIp(HttpContext context)
{
    var ip = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
    if (string.IsNullOrEmpty(ip))
    {
        ip = context.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
    }
    return ip.Split(',')[0].Trim();
}

// Helper to get country from IP (simplified - in production use GeoIP service)
static CountryInfo GetCountryFromIp(string ip)
{
    // Simplified - in production, use a GeoIP service
    return new CountryInfo("US", "United States");
}

// Start Game Endpoint
app.MapPost("/{operatorId}/{gameId}/start",
        async (string operatorId,
            string gameId,
            StartRequest request,
            HttpContext httpContext,
            SessionManager sessions,
            BalanceService balanceService,
            CurrencyService currencyService,
            GameConfigService gameConfigService,
            ITimeService timeService) =>
        {
            if (request is null)
            {
                return Results.Json(new RgsApiResponse<StartGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Request payload is required."), statusCode: 400);
            }

            var funMode = request.FunMode == 1;
            if (!funMode && string.IsNullOrWhiteSpace(request.PlayerToken))
            {
                return Results.Json(new RgsApiResponse<StartGameResponse>(
                    STATUS_BAD_REQUEST,
                    "playerToken is required when funMode=0."), statusCode: 400);
            }

            var playerId = request.PlayerToken ?? $"player_{Guid.NewGuid():N}";
            var session = sessions.CreateSession(operatorId, gameId, playerId, funMode);
            var timestamp = timeService.UtcNow;

            // Get game configuration
            var gameConfig = await gameConfigService.GetGameConfigAsync(gameId);
            
            // Get currency
            var currency = currencyService.GetCurrency(request.CurrencyId);
            
            // Get or initialize balance
            var balance = balanceService.GetBalance(playerId);
            
            // Get client info
            var clientIp = GetClientIp(httpContext);
            var clientType = request.Client ?? "desktop";
            var country = GetCountryFromIp(clientIp);
            
            // Determine game mode
            var gameMode = session.State?.IsInFreeSpins == true ? 1 : 0;
            
            // Build free spins info
            var freeSpinsInfo = session.State?.FreeSpins != null
                ? new FreeSpinsInfo(
                    Amount: session.State.FreeSpins.TotalSpinsAwarded,
                    Left: session.State.FreeSpins.SpinsRemaining,
                    BetValue: 0m, // Should track bet value used for free spins
                    RoundWin: 0m,
                    TotalWin: session.State.FreeSpins.FeatureWin.Amount,
                    TotalBet: 0m)
                : new FreeSpinsInfo(0, 0, 0m, 0m, 0m, 0m);
            
            // Promo free spins (not implemented yet, return empty)
            var promoFreeSpins = new PromoFreeSpinsInfo(0, 0, 0m, false, 0m, 0m);
            
            // Last play (not tracked yet, return null)
            LastPlayInfo? lastPlay = null;
            
            // Feature info
            FeatureInfo? feature = session.State?.FreeSpins != null
                ? new FeatureInfo("FREE_SPINS", "FREESPINS")
                : null;

            var response = new StartGameResponse(
                Player: new PlayerInfo(
                SessionId: session.SessionId,
                    Id: playerId,
                    Balance: balance),
                Client: new ClientInfo(
                    Type: clientType,
                    Ip: clientIp,
                    Country: country),
                Currency: new CurrencyInfo(
                    Symbol: currency.Symbol,
                    IsoCode: currency.IsoCode,
                    Name: currency.Name,
                    Decimals: currency.Decimals,
                    Separator: new CurrencySeparators(
                        Decimal: currency.DecimalSeparator,
                        Thousand: currency.ThousandSeparator)),
                Game: new GameInfo(
                    Rtp: gameConfig.Rtp,
                    Mode: gameMode,
                    Bet: new BetInfo(
                        Default: gameConfig.DefaultBetIndex,
                        Levels: gameConfig.BetLevels),
                    FunMode: funMode,
                    MaxWinCap: gameConfig.MaxWinCap,
                    Config: new GameConfig(
                        StartScreen: null,
                        Settings: new GameSettings(
                            IsAutoplay: gameConfig.Settings.IsAutoplay,
                            IsSlamStop: gameConfig.Settings.IsSlamStop,
                            IsBuyFeatures: gameConfig.Settings.IsBuyFeatures,
                            IsTurboSpin: gameConfig.Settings.IsTurboSpin,
                            IsRealityCheck: gameConfig.Settings.IsRealityCheck,
                            MinSpin: gameConfig.Settings.MinSpin,
                            MaxSpin: gameConfig.Settings.MaxSpin)),
                    FreeSpins: freeSpinsInfo,
                    PromoFreeSpins: promoFreeSpins,
                    LastPlay: lastPlay,
                    Feature: feature));

            return Results.Json(new RgsApiResponse<StartGameResponse>(
                STATUS_OK,
                "Request processed successfully",
                response));
        })
    .WithName("StartGame");

// Play Game Endpoint (with operatorId)
app.MapPost("/{operatorId}/{gameId}/play",
        async (string operatorId,
            string gameId,
            ClientPlayRequest request,
            SessionManager sessions,
            BalanceService balanceService,
            CurrencyService currencyService,
            GameConfigService gameConfigService,
            IEngineClient engineClient,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Request payload is required."), statusCode: 400);
            }

            if (!sessions.TryGetSession(request.SessionId, out var session))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_UNAUTHORIZED,
                    "Invalid session."), statusCode: 401);
            }

            if (!string.Equals(session.GameId, gameId, StringComparison.OrdinalIgnoreCase))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Session does not match game."), statusCode: 400);
            }

            if (!TryParseBetMode(request.BetMode, out var betMode))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Unknown betMode."), statusCode: 400);
            }

            if (request.IsFeatureBuy && betMode != BetMode.Standard)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "ANTE_MODE_BUY_NOT_ALLOWED"), statusCode: 400);
            }

            if (request.Bets is null || request.Bets.Count == 0)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "bets array is required."), statusCode: 400);
            }

            Money baseBet;
            try
            {
                baseBet = new Money(request.BaseBet);
            }
            catch (Exception ex)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    $"Invalid baseBet value: {ex.Message}"), statusCode: 400);
            }

            var totalBet = CalculateTotalBet(baseBet, betMode);

            if (totalBet.Amount <= 0)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Total bet must be positive."), statusCode: 400);
            }

            // Get previous balance and whether this spin is a free spin (no deduction)
            var prevBalance = balanceService.GetBalance(session.PlayerToken);
            var wasInFreeSpins = session.State?.IsInFreeSpins == true;

            List<BetRequest> betRequests;
            try
            {
                betRequests = ConvertBetRequests(request.Bets);
            }
            catch (ArgumentException ex)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    ex.Message), statusCode: 400);
            }

            // Get game config for RTP level and currency
            var gameConfig = await gameConfigService.GetGameConfigAsync(gameId, cancellationToken);
            var currency = currencyService.GetCurrency(null);

            // Determine game mode
            var gameMode = session.State?.IsInFreeSpins == true ? 1 : 0;

            var engineRequest = new PlayRequest(
                GameId: gameId,
                PlayerToken: session.PlayerToken,
                Bets: betRequests,
                BaseBet: baseBet,
                TotalBet: totalBet,
                BetMode: betMode,
                IsFeatureBuy: request.IsFeatureBuy,
                EngineState: session.State ?? EngineSessionState.Create(),
                UserPayload: request.UserPayload,
                LastResponse: request.LastResponse,
                RtpLevel: 1, // Default RTP level
                Mode: gameMode,
                Currency: JsonSerializer.SerializeToElement(new { id = currency.IsoCode }));

            Console.WriteLine($"[RGS] ===== PLAY REQUEST RECEIVED =====");
            Console.WriteLine($"[RGS] GameId: {gameId}, SessionId: {request.SessionId}, IsFeatureBuy: {request.IsFeatureBuy}");
            Console.WriteLine($"[RGS] BaseBet: {baseBet.Amount}, TotalBet: {totalBet.Amount}, BetMode: {betMode}");

            var engineResponse = await engineClient.PlayAsync(engineRequest, cancellationToken);
            
            Console.WriteLine($"[RGS] ===== PLAY RESPONSE RECEIVED FROM ENGINE =====");
            Console.WriteLine($"[RGS] RoundId: {engineResponse.RoundId}");
            Console.WriteLine($"[RGS] Win: {engineResponse.Win.Amount}, ScatterWin: {engineResponse.ScatterWin.Amount}, FeatureWin: {engineResponse.FeatureWin.Amount}");
            Console.WriteLine($"[RGS] FreeSpinsAwarded: {engineResponse.FreeSpinsAwarded}");

            // Process balance: feature buy = deduct buy cost; free spin = deduct 0; normal = deduct total bet
            var totalWin = engineResponse.Win.Amount;
            var amountToDeduct = request.IsFeatureBuy
                ? engineResponse.BuyCost.Amount
                : (wasInFreeSpins ? 0m : totalBet.Amount);
            var (withdrawId, depositId) = balanceService.ProcessBetAndWin(
                session.PlayerToken,
                amountToDeduct,
                totalWin);

            var newBalance = balanceService.GetBalance(session.PlayerToken);

            // Update session state
            sessions.UpdateState(session.SessionId, engineResponse.NextState);

            // Check max win cap
            var maxWinCap = gameConfig.MaxWinCap;
            var maxWinAchieved = maxWinCap > 0 && totalWin >= maxWinCap;
            var realWin = totalWin;

            // Build free spins info
            var freeSpinsLeft = engineResponse.NextState?.FreeSpins?.SpinsRemaining ?? 0;
            var freeSpinsAmount = engineResponse.NextState?.FreeSpins?.TotalSpinsAwarded ?? 0;
            var freeSpinsTotalWin = engineResponse.NextState?.FreeSpins?.FeatureWin.Amount ?? 0m;

            var freeSpinsInfo = new FreeSpinsPlayInfo(
                Amount: freeSpinsAmount,
                Left: freeSpinsLeft,
                BetValue: totalBet.Amount, // Bet value used for free spins
                IsPromotion: false,
                RoundWin: engineResponse.FeatureWin.Amount,
                TotalWin: freeSpinsTotalWin,
                TotalBet: 0m, // Should track total bet for free spins
                Won: engineResponse.FreeSpinsAwarded);

            // Promo free spins (empty for now)
            var promoFreeSpins = new PromoFreeSpinsPlayInfo(0, 0, 0m, 0, 0m, 0m);

            // Jackpots (empty for now)
            var jackpots = Array.Empty<JackpotInfo>();

            // Feature info
            var isFeatureClosure = engineResponse.NextState?.FreeSpins?.SpinsRemaining == 0 &&
                                   engineResponse.NextState?.FreeSpins != null;
            var featureInfo = engineResponse.NextState?.FreeSpins != null
                ? new FeaturePlayInfo(
                    Name: "FREE_SPINS",
                    Type: "FREESPINS",
                    IsClosure: isFeatureClosure ? 1 : 0)
                : new FeaturePlayInfo("", "", 0);

            var playerBetAmount = request.IsFeatureBuy ? engineResponse.BuyCost.Amount : (wasInFreeSpins ? 0m : totalBet.Amount);
            var response = new PlayGameResponse(
                Player: new PlayerPlayInfo(
                    SessionId: session.SessionId,
                    RoundId: engineResponse.RoundId,
                    Transaction: new TransactionInfo(
                        Withdraw: withdrawId,
                        Deposit: depositId),
                    PrevBalance: prevBalance,
                    Balance: newBalance,
                    Bet: playerBetAmount,
                    Win: totalWin,
                    CurrencyId: currency.IsoCode),
                Game: new GamePlayInfo(
                    Results: engineResponse.Results,
                    Mode: engineResponse.NextState?.IsInFreeSpins == true ? 1 : 0,
                    MaxWinCap: new MaxWinCapInfo(
                        Achieved: maxWinAchieved,
                        Value: maxWinCap,
                        RealWin: realWin)),
                FreeSpins: freeSpinsInfo,
                PromoFreeSpins: promoFreeSpins,
                Jackpots: jackpots,
                Feature: featureInfo);

            return Results.Json(new RgsApiResponse<PlayGameResponse>(
                STATUS_OK,
                "Request processed successfully",
                response));
        })
    .WithName("Play");

// Buy Free Spins Endpoint
app.MapPost("/{operatorId}/{gameId}/buy-free-spins",
        async (string operatorId,
            string gameId,
            BuyFeatureRequest request,
            SessionManager sessions,
            BalanceService balanceService,
            CurrencyService currencyService,
            GameConfigService gameConfigService,
            IEngineClient engineClient,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Request payload is required."), statusCode: 400);
            }

            if (!sessions.TryGetSession(request.SessionId, out var session))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_UNAUTHORIZED,
                    "Invalid session."), statusCode: 401);
            }

            if (!string.Equals(session.GameId, gameId, StringComparison.OrdinalIgnoreCase))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Session does not match game."), statusCode: 400);
            }

            if (!TryParseBetMode(request.BetMode, out var betMode))
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Unknown betMode."), statusCode: 400);
            }

            if (betMode != BetMode.Standard)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "ANTE_MODE_BUY_NOT_ALLOWED"), statusCode: 400);
            }

            Money baseBet;
            try
            {
                baseBet = new Money(request.BaseBet);
            }
            catch (Exception ex)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    $"Invalid baseBet value: {ex.Message}"), statusCode: 400);
            }

            var totalBet = CalculateTotalBet(baseBet, betMode);
            if (totalBet.Amount <= 0)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    "Total bet must be positive."), statusCode: 400);
            }

            List<BetRequest> betRequests;
            try
            {
                betRequests = request.Bets is { Count: > 0 }
                    ? ConvertBetRequests(request.Bets)
                    : new List<BetRequest> { new("BASE", baseBet) };
            }
            catch (ArgumentException ex)
            {
                return Results.Json(new RgsApiResponse<PlayGameResponse>(
                    STATUS_BAD_REQUEST,
                    ex.Message), statusCode: 400);
            }

            // Get game config
            var gameConfig = await gameConfigService.GetGameConfigAsync(gameId, cancellationToken);
            var currency = currencyService.GetCurrency(null);
            var gameMode = session.State?.IsInFreeSpins == true ? 1 : 0;

            var engineRequest = new PlayRequest(
                GameId: gameId,
                PlayerToken: session.PlayerToken,
                Bets: betRequests,
                BaseBet: baseBet,
                TotalBet: totalBet,
                BetMode: betMode,
                IsFeatureBuy: true,
                EngineState: session.State ?? EngineSessionState.Create(),
                UserPayload: request.UserPayload,
                LastResponse: null,
                RtpLevel: 1,
                Mode: gameMode,
                Currency: JsonSerializer.SerializeToElement(new { id = currency.IsoCode }));

            var engineResponse = await engineClient.PlayAsync(engineRequest, cancellationToken);
            
            // Process buy cost
            var buyCost = engineResponse.BuyCost.Amount;
            var prevBalance = balanceService.GetBalance(session.PlayerToken);
            balanceService.Withdraw(session.PlayerToken, buyCost);
            var balanceAfterBuy = balanceService.GetBalance(session.PlayerToken);

            // Process win if any
            var totalWin = engineResponse.Win.Amount;
            if (totalWin > 0)
            {
                balanceService.Deposit(session.PlayerToken, totalWin);
            }
            
            var finalBalance = balanceService.GetBalance(session.PlayerToken);

            sessions.UpdateState(session.SessionId, engineResponse.NextState);
            
            if (buyCost > 0)
            {
                logger.LogInformation("Buy feature charged {Amount}", buyCost);
            }

            // Build response (similar to play endpoint)
            var freeSpinsLeft = engineResponse.NextState?.FreeSpins?.SpinsRemaining ?? 0;
            var freeSpinsAmount = engineResponse.NextState?.FreeSpins?.TotalSpinsAwarded ?? 0;
            var freeSpinsTotalWin = engineResponse.NextState?.FreeSpins?.FeatureWin.Amount ?? 0m;

            var freeSpinsInfo = new FreeSpinsPlayInfo(
                Amount: freeSpinsAmount,
                Left: freeSpinsLeft,
                BetValue: totalBet.Amount,
                IsPromotion: false,
                RoundWin: engineResponse.FeatureWin.Amount,
                TotalWin: freeSpinsTotalWin,
                TotalBet: 0m,
                Won: engineResponse.FreeSpinsAwarded);

            var promoFreeSpins = new PromoFreeSpinsPlayInfo(0, 0, 0m, 0, 0m, 0m);
            var jackpots = Array.Empty<JackpotInfo>();

            var isFeatureClosure = engineResponse.NextState?.FreeSpins?.SpinsRemaining == 0 &&
                                   engineResponse.NextState?.FreeSpins != null;
            var featureInfo = engineResponse.NextState?.FreeSpins != null
                ? new FeaturePlayInfo("FREE_SPINS", "FREESPINS", isFeatureClosure ? 1 : 0)
                : new FeaturePlayInfo("", "", 0);

            var maxWinCap = gameConfig.MaxWinCap;
            var maxWinAchieved = maxWinCap > 0 && totalWin >= maxWinCap;

            var response = new PlayGameResponse(
                Player: new PlayerPlayInfo(
                    SessionId: session.SessionId,
                    RoundId: engineResponse.RoundId,
                    Transaction: new TransactionInfo("", ""), // Buy feature doesn't create standard transactions
                    PrevBalance: prevBalance,
                    Balance: finalBalance,
                    Bet: buyCost,
                    Win: totalWin,
                    CurrencyId: currency.IsoCode),
                Game: new GamePlayInfo(
                    Results: engineResponse.Results,
                    Mode: 1, // Free spins mode
                    MaxWinCap: new MaxWinCapInfo(maxWinAchieved, maxWinCap, totalWin)),
                FreeSpins: freeSpinsInfo,
                PromoFreeSpins: promoFreeSpins,
                Jackpots: jackpots,
                Feature: featureInfo);

            return Results.Json(new RgsApiResponse<PlayGameResponse>(
                STATUS_OK,
                "Request processed successfully",
                response));
        })
    .WithName("BuyFreeSpins");

// Player Balance Endpoint
app.MapPost("/{operatorId}/player/balance",
        (string operatorId,
            BalanceRequest request,
            BalanceService balanceService) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.PlayerId))
            {
                return Results.Json(new RgsApiResponse<BalanceResponse>(
                    STATUS_BAD_REQUEST,
                    "playerId is required."), statusCode: 400);
            }

            var balance = balanceService.GetBalance(request.PlayerId);

            return Results.Json(new RgsApiResponse<BalanceResponse>(
                STATUS_OK,
                "Request processed successfully",
                new BalanceResponse(balance)));
        })
    .WithName("PlayerBalance");

app.Run();

static bool TryParseBetMode(string? value, out BetMode mode)
{
    if (string.Equals(value, "ante", StringComparison.OrdinalIgnoreCase))
    {
        mode = BetMode.Ante;
        return true;
    }

    if (string.Equals(value, "standard", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(value))
    {
        mode = BetMode.Standard;
        return true;
    }

    mode = BetMode.Standard;
    return false;
}

static Money CalculateTotalBet(Money baseBet, BetMode mode)
{
    var multiplier = mode == BetMode.Ante ? 1.25m : 1m;
    var amount = decimal.Round(baseBet.Amount * multiplier, 2, MidpointRounding.ToEven);
    return new Money(amount);
}

static List<BetRequest> ConvertBetRequests(IReadOnlyList<ClientBetRequest> bets)
{
    var betRequests = new List<BetRequest>(bets.Count);
    foreach (var bet in bets)
    {
        try
        {
            betRequests.Add(new BetRequest(bet.BetType, new Money(bet.Amount)));
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"Invalid bet entry: {ex.Message}");
        }
    }

    return betRequests;
}
