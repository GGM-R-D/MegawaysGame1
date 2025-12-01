using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using GameEngine.Configuration;
using GameEngine.Play;

const string defaultGameId = "JungleRelics";
var totalSpins = ParseArgument("--spins=", 1_000_000, int.Parse);
var baseBetValue = ParseArgument("--bet=", 0.20m, value => decimal.Parse(value, CultureInfo.InvariantCulture));
var betMode = ParseArgument("--betMode=", BetMode.Standard, value =>
{
    return string.Equals(value, "ante", StringComparison.OrdinalIgnoreCase) ? BetMode.Ante : BetMode.Standard;
});
var buyEvery = ParseArgument("--buyFrequency=", 0, int.Parse);
var engineBaseUrl = ParseArgument("--engineBaseUrl=", "http://localhost:5101", value => value);

var waitForExit = args.Contains("--wait", StringComparer.OrdinalIgnoreCase);
Console.WriteLine($"Running Monte Carlo ({totalSpins:N0} spins) bet={baseBetValue} mode={betMode} buyEvery={buyEvery}");

using var httpClient = new HttpClient { BaseAddress = new Uri(engineBaseUrl) };
var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};
jsonOptions.Converters.Add(new JsonStringEnumConverter());

var stats = new SimulationStats();
var state = EngineSessionState.Create();
var baseBet = new GameEngine.Configuration.Money(baseBetValue);

for (var spinIndex = 0; spinIndex < totalSpins; spinIndex++)
{
    var isBuy = buyEvery > 0 && spinIndex % buyEvery == 0;
    var totalBet = betMode == BetMode.Ante
        ? new GameEngine.Configuration.Money(baseBet.Amount * 1.25m)
        : baseBet;

    var request = new PlayRequest(
        GameId: defaultGameId,
        PlayerToken: "simulation",
        Bets: new[] { new BetRequest("BASE", baseBet) },
        BaseBet: baseBet,
        TotalBet: totalBet,
        BetMode: betMode,
        IsFeatureBuy: isBuy,
        EngineState: state,
        UserPayload: null,
        LastResponse: null);

    var httpResponse = await httpClient.PostAsJsonAsync("/play", request, jsonOptions);
    httpResponse.EnsureSuccessStatusCode();
    var response = await httpResponse.Content.ReadFromJsonAsync<PlayResponse>(jsonOptions)
                    ?? throw new InvalidOperationException("Engine response payload was empty.");

    state = response.NextState;

    stats.TotalRounds++;
    stats.TotalWagered += request.TotalBet.Amount;
    stats.TotalWagered += response.BuyCost.Amount;
    stats.TotalReturn += response.Win.Amount;
    stats.HitCount += response.Win.Amount > 0 ? 1 : 0;
    stats.ScatterWins += response.ScatterWin.Amount;
    stats.FeatureWins += response.FeatureWin.Amount;
    stats.BuyCount += isBuy ? 1 : 0;
    stats.FeatureTriggers += response.FreeSpinsAwarded > 0 ? 1 : 0;
}

Console.WriteLine("---- Results ----");
Console.WriteLine($"Total wagered: {stats.TotalWagered:F2}");
Console.WriteLine($"Total returned: {stats.TotalReturn:F2}");
Console.WriteLine($"RTP: {stats.TotalReturn / stats.TotalWagered:P4}");
Console.WriteLine($"Hit Frequency: {(double)stats.HitCount / stats.TotalRounds:P4}");
Console.WriteLine($"Feature Triggers: {stats.FeatureTriggers} ({(double)stats.FeatureTriggers / stats.TotalRounds:P4})");
Console.WriteLine($"Buys: {stats.BuyCount}");
Console.WriteLine($"Scatter Win Contribution: {stats.ScatterWins / stats.TotalReturn:P2}");
Console.WriteLine($"Feature Win Contribution: {stats.FeatureWins / stats.TotalReturn:P2}");

if (waitForExit)
{
    Console.WriteLine("Simulation complete. Press Enter to exit...");
    Console.ReadLine();
}

static T ParseArgument<T>(string key, T defaultValue, Func<string, T> parser)
{
    var argument = Environment.GetCommandLineArgs()
        .Skip(1)
        .FirstOrDefault(arg => arg.StartsWith(key, StringComparison.OrdinalIgnoreCase));
    if (argument is null)
    {
        return defaultValue;
    }

    var value = argument.Substring(key.Length);
    return parser(value);
}

sealed class SimulationStats
{
    public int TotalRounds { get; set; }
    public decimal TotalWagered { get; set; }
    public decimal TotalReturn { get; set; }
    public int HitCount { get; set; }
    public int FeatureTriggers { get; set; }
    public int BuyCount { get; set; }
    public decimal ScatterWins { get; set; }
    public decimal FeatureWins { get; set; }
}
