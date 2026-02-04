using System.Collections.Concurrent;

namespace RGS.Services;

/// <summary>
/// Manages player balances and transactions
/// </summary>
public sealed class BalanceService
{
    private readonly ConcurrentDictionary<string, decimal> _balances = new();
    private readonly ConcurrentDictionary<string, List<TransactionRecord>> _transactions = new();

    public decimal GetBalance(string playerId)
    {
        return _balances.GetValueOrDefault(playerId, 10000m); // Default balance for demo
    }

    public void SetBalance(string playerId, decimal balance)
    {
        _balances[playerId] = balance;
    }

    public decimal Withdraw(string playerId, decimal amount)
    {
        var currentBalance = GetBalance(playerId);
        if (currentBalance < amount)
        {
            throw new InvalidOperationException("Insufficient balance");
        }

        var newBalance = currentBalance - amount;
        SetBalance(playerId, newBalance);
        
        RecordTransaction(playerId, TransactionType.Withdraw, amount, currentBalance, newBalance);
        
        return newBalance;
    }

    public decimal Deposit(string playerId, decimal amount)
    {
        var currentBalance = GetBalance(playerId);
        var newBalance = currentBalance + amount;
        SetBalance(playerId, newBalance);
        
        RecordTransaction(playerId, TransactionType.Deposit, amount, currentBalance, newBalance);
        
        return newBalance;
    }

    public (string WithdrawId, string DepositId) ProcessBetAndWin(
        string playerId, 
        decimal betAmount, 
        decimal winAmount)
    {
        var prevBalance = GetBalance(playerId);
        
        // Withdraw bet
        var withdrawId = Guid.NewGuid().ToString("N");
        var balanceAfterBet = Withdraw(playerId, betAmount);
        
        // Deposit win
        var depositId = Guid.NewGuid().ToString("N");
        var finalBalance = Deposit(playerId, winAmount);
        
        RecordTransaction(playerId, TransactionType.Withdraw, betAmount, prevBalance, balanceAfterBet, withdrawId);
        RecordTransaction(playerId, TransactionType.Deposit, winAmount, balanceAfterBet, finalBalance, depositId);
        
        return (withdrawId, depositId);
    }

    private void RecordTransaction(
        string playerId, 
        TransactionType type, 
        decimal amount, 
        decimal prevBalance, 
        decimal newBalance,
        string? transactionId = null)
    {
        if (!_transactions.TryGetValue(playerId, out var transactions))
        {
            transactions = new List<TransactionRecord>();
            _transactions[playerId] = transactions;
        }

        transactions.Add(new TransactionRecord(
            transactionId ?? Guid.NewGuid().ToString("N"),
            type,
            amount,
            prevBalance,
            newBalance,
            DateTimeOffset.UtcNow));
    }

    public TransactionRecord? GetLastTransaction(string playerId, TransactionType type)
    {
        if (!_transactions.TryGetValue(playerId, out var transactions))
        {
            return null;
        }

        return transactions
            .Where(t => t.Type == type)
            .OrderByDescending(t => t.Timestamp)
            .FirstOrDefault();
    }
}

public sealed record TransactionRecord(
    string TransactionId,
    TransactionType Type,
    decimal Amount,
    decimal PrevBalance,
    decimal NewBalance,
    DateTimeOffset Timestamp);

public enum TransactionType
{
    Withdraw,
    Deposit
}

