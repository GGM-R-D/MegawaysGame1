using System.Text.Json;
using GameEngine.Configuration;

namespace RGS.Services;

/// <summary>
/// Loads and provides game configuration for RGS responses
/// </summary>
public sealed class GameConfigService
{
    private readonly GameEngine.Configuration.GameConfigurationLoader _configLoader;
    private readonly Dictionary<string, GameConfigData> _gameConfigs = new();

    public GameConfigService(GameEngine.Configuration.GameConfigurationLoader configLoader)
    {
        _configLoader = configLoader;
    }

    public async Task<GameConfigData> GetGameConfigAsync(string gameId, CancellationToken cancellationToken = default)
    {
        if (_gameConfigs.TryGetValue(gameId, out var cached))
        {
            return cached;
        }

        var config = await _configLoader.GetConfigurationAsync(gameId, cancellationToken);
        
        // Convert Money list to decimal list
        var betLevels = config.BetLevels.Count > 0
            ? config.BetLevels.Select(b => b.Amount).ToList()
            : new List<decimal> { 0.20m, 0.40m, 1.00m, 2.00m, 5.00m, 10.00m };
        
        var gameConfig = new GameConfigData(
            Rtp: 96.52m, // Default RTP, should be configurable
            BetLevels: betLevels,
            DefaultBetIndex: config.DefaultBetIndex,
            MaxWinCap: config.MaxWinMultiplier > 0 
                ? config.MaxWinMultiplier * 10m // Example: multiply by base bet
                : 0m,
            Settings: new GameSettingsData(
                IsAutoplay: "1",
                IsSlamStop: "1",
                IsBuyFeatures: !string.IsNullOrWhiteSpace(config.BuyFeature.EnabledBetMode) ? "1" : "0",
                IsTurboSpin: "1",
                IsRealityCheck: "1",
                MinSpin: "0",
                MaxSpin: "0"
            )
        );

        _gameConfigs[gameId] = gameConfig;
        return gameConfig;
    }
}

public sealed record GameConfigData(
    decimal Rtp,
    IReadOnlyList<decimal> BetLevels,
    int DefaultBetIndex,
    decimal MaxWinCap,
    GameSettingsData Settings);

public sealed record GameSettingsData(
    string IsAutoplay,
    string IsSlamStop,
    string IsBuyFeatures,
    string IsTurboSpin,
    string IsRealityCheck,
    string MinSpin,
    string MaxSpin);

