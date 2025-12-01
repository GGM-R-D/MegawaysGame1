using System.Collections.Generic;
using System.Linq;
using GameEngine.Configuration;

namespace GameEngine.Play;

public sealed class WinEvaluator
{
    public WinEvaluationResult Evaluate(IReadOnlyList<string> grid, GameConfiguration configuration, Money bet)
    {
        if (configuration.Board.Megaways && configuration.Megaways is not null)
        {
            return EvaluateMegaways(grid, configuration, bet);
        }

        return EvaluateTraditional(grid, configuration, bet);
    }

    private WinEvaluationResult EvaluateTraditional(IReadOnlyList<string> grid, GameConfiguration configuration, Money bet)
    {
        var wins = new List<SymbolWin>();
        var totalWin = 0m;

        foreach (var entry in configuration.Paytable)
        {
            var indices = new List<int>();
            for (var i = 0; i < grid.Count; i++)
            {
                if (grid[i] == entry.SymbolCode)
                {
                    indices.Add(i);
                }
            }

            var symbolCount = indices.Count;
            if (symbolCount < 8)
            {
                continue;
            }

            var bestMatch = entry.Multipliers
                .Where(mult => symbolCount >= mult.Count)
                .OrderByDescending(mult => mult.Count)
                .FirstOrDefault();

            if (bestMatch is null)
            {
                continue;
            }

            var payout = Money.FromBet(bet.Amount, bestMatch.Multiplier);
            wins.Add(new SymbolWin(entry.SymbolCode, symbolCount, bestMatch.Multiplier, payout, indices));
            totalWin += payout.Amount;
        }

        return new WinEvaluationResult(new Money(totalWin), wins);
    }

    private WinEvaluationResult EvaluateMegaways(IReadOnlyList<string> grid, GameConfiguration configuration, Money bet)
    {
        var wins = new List<SymbolWin>();
        var totalWin = 0m;
        var columns = configuration.Board.Columns;
        var maxRows = configuration.Board.MaxRows ?? configuration.Board.Rows;
        // Maximum value for Money type (decimal(20,2))
        const decimal maxMoneyValue = 999999999999999999.99m;

        // Reconstruct grid structure: columns x rows
        // Grid is in row-major order (row 0, all cols; row 1, all cols; etc.)
        var gridMatrix = new List<List<string?>>();
        for (var row = 0; row < maxRows; row++)
        {
            var rowData = new List<string?>();
            for (var col = 0; col < columns; col++)
            {
                var index = row * columns + col;
                rowData.Add(index < grid.Count ? grid[index] : null);
            }
            gridMatrix.Add(rowData);
        }

        foreach (var entry in configuration.Paytable)
        {
            // Count symbols per reel (column)
            var symbolsPerReel = new List<int>(columns);
            var allIndices = new List<int>();

            for (var col = 0; col < columns; col++)
            {
                var symbolCount = 0;
                for (var row = 0; row < maxRows; row++)
                {
                    if (row < gridMatrix.Count && col < gridMatrix[row].Count && gridMatrix[row][col] == entry.SymbolCode)
                    {
                        symbolCount++;
                        var index = row * columns + col;
                        if (index < grid.Count)
                        {
                            allIndices.Add(index);
                        }
                    }
                }
                symbolsPerReel.Add(symbolCount);
            }

            // Calculate ways to win: product of symbol counts per reel
            // Symbols must appear on adjacent reels starting from left (reel 0)
            var ways = 1;
            var firstReelWithSymbols = -1;
            var lastReelWithSymbols = -1;

            for (var i = 0; i < symbolsPerReel.Count; i++)
            {
                if (symbolsPerReel[i] > 0)
                {
                    if (firstReelWithSymbols == -1)
                    {
                        firstReelWithSymbols = i;
                    }
                    lastReelWithSymbols = i;
                    ways *= symbolsPerReel[i];
                }
            }

            // Must start from reel 0 (leftmost) and be contiguous
            if (firstReelWithSymbols != 0 || ways == 1)
            {
                continue;
            }

            // Use symbol count (total symbols) for paytable lookup
            var totalSymbolCount = symbolsPerReel.Sum();
            if (totalSymbolCount < 2)
            {
                continue;
            }

            var bestMatch = entry.Multipliers
                .Where(mult => totalSymbolCount >= mult.Count)
                .OrderByDescending(mult => mult.Count)
                .FirstOrDefault();

            if (bestMatch is null)
            {
                continue;
            }

            // Payout: base multiplier from paytable, but ways affect the total
            // For Megaways, we use the ways directly as a multiplier factor
            var basePayout = Money.FromBet(bet.Amount, bestMatch.Multiplier);
            // Ways multiplier: ways / minimum ways (2^columns for minimum)
            var minWays = (int)Math.Pow(2, columns);
            var waysMultiplier = (decimal)ways / minWays;
            
            // Calculate payout amount and ensure it doesn't exceed Money's decimal(20,2) limit
            var payoutAmount = basePayout.Amount * waysMultiplier;
            // Round to 2 decimal places and clamp to valid range
            payoutAmount = Math.Round(payoutAmount, 2, MidpointRounding.ToZero);
            // Ensure it doesn't exceed maximum value for decimal(20,2)
            if (payoutAmount > maxMoneyValue)
            {
                payoutAmount = maxMoneyValue;
            }
            var payout = new Money(payoutAmount);
            
            wins.Add(new SymbolWin(entry.SymbolCode, totalSymbolCount, bestMatch.Multiplier, payout, allIndices, ways));
            totalWin += payout.Amount;
        }

        // Ensure totalWin doesn't exceed Money's limits
        totalWin = Math.Round(totalWin, 2, MidpointRounding.ToZero);
        if (totalWin > maxMoneyValue)
        {
            totalWin = maxMoneyValue;
        }

        return new WinEvaluationResult(new Money(totalWin), wins);
    }
}

public sealed record WinEvaluationResult(Money TotalWin, IReadOnlyList<SymbolWin> SymbolWins);

