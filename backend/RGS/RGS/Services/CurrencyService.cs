namespace RGS.Services;

/// <summary>
/// Manages currency information and formatting
/// </summary>
public sealed class CurrencyService
{
    private readonly Dictionary<string, CurrencyDefinition> _currencies = new()
    {
        ["USD"] = new CurrencyDefinition("$", "USD", "US Dollar", 2, ".", ","),
        ["EUR"] = new CurrencyDefinition("€", "EUR", "Euro", 2, ".", ","),
        ["GBP"] = new CurrencyDefinition("£", "GBP", "Pound sterling", 2, ".", ","),
        ["ZAR"] = new CurrencyDefinition("R", "ZAR", "South African Rand", 2, ".", ","),
    };

    private readonly string _defaultCurrency = "USD";

    public CurrencyDefinition GetCurrency(string? currencyId)
    {
        if (string.IsNullOrWhiteSpace(currencyId))
        {
            return _currencies[_defaultCurrency];
        }

        return _currencies.GetValueOrDefault(currencyId.ToUpperInvariant(), _currencies[_defaultCurrency]);
    }

    public CurrencyDefinition GetDefaultCurrency()
    {
        return _currencies[_defaultCurrency];
    }
}

public sealed record CurrencyDefinition(
    string Symbol,
    string IsoCode,
    string Name,
    int Decimals,
    string DecimalSeparator,
    string ThousandSeparator);

