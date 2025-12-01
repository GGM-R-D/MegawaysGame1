using System.Text.Json;
using System.Text.Json.Serialization;
using GameEngine;
using GameEngine.Configuration;
using GameEngine.Play;
using GameEngine.Services;
using GameEngineHost.Services;
using Microsoft.AspNetCore.OpenApi;
using RNGClient;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new MoneyJsonConverter());
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var configDirectory = ResolvePath(builder.Configuration["GameEngine:ConfigurationDirectory"] ?? "..\\RGS\\RGS\\configs", builder.Environment);
var manifestPath = ResolvePath(builder.Configuration["GameEngine:ControlProgramManifest"] ?? "..\\RGS\\RGS\\control-program-manifest.json", builder.Environment);
builder.Services.AddGameEngine(configDirectory, manifestPath);
builder.Services.AddSingleton<ISpinTelemetrySink, NullSpinTelemetrySink>();
builder.Services.AddSingleton<IEngineClient, LocalEngineClient>();
var rngBaseUrl = builder.Configuration["Rng:BaseUrl"] ?? "http://localhost:5102/pools";
builder.Services.AddHttpClient("rng", client => client.BaseAddress = new Uri(rngBaseUrl));
builder.Services.AddSingleton<IRngClient>(sp =>
{
    var factory = sp.GetRequiredService<IHttpClientFactory>();
    var options = new RngClientOptions(rngBaseUrl);
    return new RngClient(options, factory.CreateClient("rng"));
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseSwagger();
app.UseSwaggerUI();
app.MapControllers();

app.Run();

static string ResolvePath(string path, IWebHostEnvironment environment)
{
    if (Path.IsPathRooted(path))
    {
        return path;
    }

    return Path.GetFullPath(Path.Combine(environment.ContentRootPath, path));
}
