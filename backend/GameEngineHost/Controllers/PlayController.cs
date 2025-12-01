using System.Linq;
using GameEngine.Play;
using GameEngineHost.Services;
using Microsoft.AspNetCore.Mvc;

namespace GameEngineHost.Controllers;

[ApiController]
[Route("play")]
public sealed class PlayController : ControllerBase
{
    private readonly IEngineClient _engineClient;

    public PlayController(IEngineClient engineClient)
    {
        _engineClient = engineClient;
    }

    [HttpPost]
    public async Task<ActionResult<PlayResponse>> Play([FromBody] PlayRequest request, CancellationToken cancellationToken)
    {
        Console.WriteLine($"[GameEngine] ===== PLAY REQUEST RECEIVED =====");
        Console.WriteLine($"[GameEngine] GameId: {request.GameId}");
        Console.WriteLine($"[GameEngine] BaseBet: {request.BaseBet.Amount}, TotalBet: {request.TotalBet.Amount}, BetMode: {request.BetMode}");
        Console.WriteLine($"[GameEngine] IsFeatureBuy: {request.IsFeatureBuy}");

        var response = await _engineClient.PlayAsync(request, cancellationToken);
        
        Console.WriteLine($"[GameEngine] ===== PLAY RESPONSE GENERATED =====");
        Console.WriteLine($"[GameEngine] RoundId: {response.RoundId}");
        Console.WriteLine($"[GameEngine] Win: {response.Win.Amount}, ScatterWin: {response.ScatterWin.Amount}, FeatureWin: {response.FeatureWin.Amount}");
        Console.WriteLine($"[GameEngine] FreeSpinsAwarded: {response.FreeSpinsAwarded}");
        Console.WriteLine($"[GameEngine] WaysToWin: {response.Results.WaysToWin ?? 0}");
        Console.WriteLine($"[GameEngine] ReelHeights: [{string.Join(", ", response.Results.ReelHeights ?? Array.Empty<int>())}]");
        
        // Log final grid symbols being sent to frontend
        if (response.Results.FinalGridSymbols != null && response.Results.FinalGridSymbols.Count > 0)
        {
            Console.WriteLine($"[GameEngine] FinalGridSymbols count: {response.Results.FinalGridSymbols.Count}");
            Console.WriteLine($"[GameEngine] FinalGridSymbols (first 30): [{string.Join(", ", response.Results.FinalGridSymbols.Take(30))}]");
            
            if (response.Results.ReelHeights != null && response.Results.ReelHeights.Count > 0)
            {
                int columns = response.Results.ReelHeights.Count;
                int maxHeight = response.Results.ReelHeights.Max();
                Console.WriteLine($"[GameEngine] Expected frontend display:");
                
                // Top reel is separate - use TopReelSymbols array
                if (response.Results.TopReelSymbols != null)
                {
                    Console.WriteLine($"[GameEngine]   TOP REEL (row {maxHeight}, columns 1-4): [{string.Join(", ", response.Results.TopReelSymbols)}]");
                    Console.WriteLine($"[GameEngine]     Note: Frontend should use TopReelSymbols array for top reel, NOT finalGridSymbols");
                }
                
                // Main reels use finalGridSymbols
                for (int col = 0; col < columns; col++)
                {
                    int reelHeight = response.Results.ReelHeights[col];
                    var reelSymbols = new List<string>();
                    for (int row = 0; row < reelHeight; row++)
                    {
                        int matrixRow = row;
                        int idx = (maxHeight - matrixRow) * columns + col;
                        if (idx >= 0 && idx < response.Results.FinalGridSymbols.Count)
                        {
                            string symbol = response.Results.FinalGridSymbols[idx];
                            if (symbol != null)
                            {
                                reelSymbols.Add(symbol);
                            }
                            else
                            {
                                reelSymbols.Add("NULL");
                            }
                        }
                        else
                        {
                            reelSymbols.Add($"OUT_OF_BOUNDS(idx={idx})");
                        }
                    }
                    Console.WriteLine($"[GameEngine]   Reel {col} (height {reelHeight}): [{string.Join(", ", reelSymbols)}] (row 0=bottom, row {reelHeight-1}=top)");
                }
            }
        }
        
        Console.WriteLine($"[GameEngine] ====================================");

        return Ok(response);
    }
}

