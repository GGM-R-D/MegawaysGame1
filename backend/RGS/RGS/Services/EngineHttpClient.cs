using System.Net.Http.Json;
using System.Text.Json;
using GameEngine.Play;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;

namespace RGS.Services;

public interface IEngineClient
{
    Task<PlayResponse> PlayAsync(PlayRequest request, CancellationToken cancellationToken);
}

public sealed class EngineHttpClient : IEngineClient
{
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _serializerOptions;

    public EngineHttpClient(HttpClient httpClient, IOptions<JsonOptions> jsonOptions)
    {
        _httpClient = httpClient;
        _serializerOptions = jsonOptions.Value.SerializerOptions;
    }

    public async Task<PlayResponse> PlayAsync(PlayRequest request, CancellationToken cancellationToken)
    {
        Console.WriteLine($"[RGS->Engine] Sending PlayRequest to Game Engine:");
        Console.WriteLine($"[RGS->Engine]   GameId: {request.GameId}");
        Console.WriteLine($"[RGS->Engine]   BaseBet: {request.BaseBet.Amount}, TotalBet: {request.TotalBet.Amount}");

        var response = await _httpClient.PostAsJsonAsync("/play", request, _serializerOptions, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<PlayResponse>(_serializerOptions, cancellationToken: cancellationToken);
        
        Console.WriteLine($"[RGS->Engine] Received PlayResponse from Game Engine:");
        Console.WriteLine($"[RGS->Engine]   RoundId: {payload?.RoundId ?? "N/A"}, Win: {payload?.Win.Amount ?? 0}");

        return payload ?? throw new InvalidOperationException("Engine response payload was empty.");
    }
}

