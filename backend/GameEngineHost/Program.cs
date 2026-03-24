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
var configDirectory = ResolvePath(builder.Configuration["GameEngine:ConfigurationDirectory"] ?? "configs", builder.Environment);
var manifestPath = ResolvePath(builder.Configuration["GameEngine:ControlProgramManifest"] ?? "configs/control-program-manifest.json", builder.Environment);
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



/*"reelsetLow": [
    ["Sym11","Sym6","Sym10","Sym8","Sym10","Sym11","Sym9","Sym11","Sym5","Sym7","Sym9","Sym11","Sym11","Sym6","Sym9","Sym9","Sym10","Sym11","Sym1","Sym8","Sym10","Sym5","Sym9","Sym4","Sym6","Sym8","Sym11","Sym10","Sym6","Sym10","Sym5","Sym7","Sym4","Sym10","Sym10","Sym2","Sym11","Sym8","Sym11","Sym10","Sym10","Sym7","Sym4","Sym6","Sym10","Sym7","Sym7","Sym7","Sym8","Sym8","Sym11","Sym10","Sym11","Sym3","Sym5","Sym9","Sym11","Sym7","Sym8","Sym5","Sym5","Sym4","Sym9","Sym1","Sym10","Sym5","Sym6","Sym11","Sym10","Sym4","Sym11","Sym9","Sym11","Sym5","Sym7","Sym10","Sym9","Sym10","Sym9","Sym3","Sym6","Sym7","Sym8","Sym8","Sym3","Sym4","Sym9","Sym2","Sym7","Sym3","Sym11","Sym8","Sym6","Sym9"],
    ["Sym10","Sym12","Sym7","Sym6","Sym8","Sym1","Sym5","Sym8","Sym1","Sym7","Sym8","Sym2","Sym11","Sym11","Sym10","Sym3","Sym10","Sym10","Sym10","Sym4","Sym3","Sym5","Sym4","Sym5","Sym6","Sym8","Sym11","Sym9","Sym7","Sym10","Sym11","Sym7","Sym7","Sym11","Sym10","Sym6","Sym11","Sym7","Sym11","Sym9","Sym8","Sym5","Sym10","Sym9","Sym12","Sym4","Sym3","Sym6","Sym5","Sym10","Sym10","Sym4","Sym11","Sym6","Sym6","Sym6","Sym11","Sym9","Sym10","Sym6","Sym5","Sym10","Sym11","Sym11","Sym9","Sym5","Sym7","Sym11","Sym9","Sym9","Sym11","Sym7","Sym4","Sym7","Sym8","Sym9","Sym7","Sym3","Sym8","Sym11","Sym11","Sym8","Sym10","Sym10","Sym8","Sym5","Sym9","Sym10","Sym10","Sym9","Sym11","Sym9","Sym4","Sym9","Sym8","Sym2"],
    ["Sym4","Sym10","Sym5","Sym4","Sym6","Sym7","Sym10","Sym9","Sym11","Sym6","Sym11","Sym11","Sym5","Sym7","Sym11","Sym11","Sym10","Sym5","Sym3","Sym10","Sym9","Sym6","Sym8","Sym11","Sym4","Sym10","Sym5","Sym4","Sym8","Sym5","Sym3","Sym8","Sym6","Sym2","Sym2","Sym10","Sym10","Sym9","Sym8","Sym9","Sym9","Sym7","Sym8","Sym11","Sym9","Sym6","Sym3","Sym7","Sym9","Sym9","Sym11","Sym8","Sym6","Sym10","Sym1","Sym7","Sym8","Sym3","Sym6","Sym10","Sym10","Sym11","Sym11","Sym8","Sym11","Sym8","Sym11","Sym12","Sym5","Sym11","Sym10","Sym4","Sym5","Sym11","Sym12","Sym10","Sym7","Sym10","Sym7","Sym9","Sym6","Sym10","Sym11","Sym7","Sym11","Sym5","Sym10","Sym10","Sym7","Sym9","Sym8","Sym1","Sym9","Sym7","Sym4","Sym9"],
    ["Sym4","Sym5","Sym7","Sym12","Sym4","Sym7","Sym9","Sym6","Sym8","Sym7","Sym11","Sym9","Sym9","Sym5","Sym11","Sym8","Sym10","Sym8","Sym11","Sym6","Sym5","Sym10","Sym7","Sym8","Sym7","Sym11","Sym6","Sym5","Sym6","Sym8","Sym5","Sym9","Sym9","Sym10","Sym8","Sym5","Sym10","Sym6","Sym3","Sym10","Sym11","Sym7","Sym10","Sym9","Sym4","Sym8","Sym5","Sym10","Sym9","Sym10","Sym2","Sym11","Sym7","Sym11","Sym7","Sym10","Sym12","Sym10","Sym7","Sym11","Sym4","Sym3","Sym11","Sym9","Sym11","Sym6","Sym1","Sym10","Sym9","Sym9","Sym1","Sym4","Sym3","Sym9","Sym8","Sym11","Sym10","Sym6","Sym10","Sym4","Sym11","Sym11","Sym10","Sym7","Sym9","Sym10","Sym10","Sym11","Sym6","Sym11","Sym8","Sym5","Sym2","Sym11","Sym3","Sym8"],
    ["Sym6","Sym1","Sym10","Sym7","Sym5","Sym10","Sym8","Sym7","Sym5","Sym7","Sym7","Sym6","Sym9","Sym11","Sym4","Sym4","Sym11","Sym6","Sym10","Sym8","Sym10","Sym11","Sym11","Sym8","Sym9","Sym6","Sym9","Sym2","Sym9","Sym11","Sym9","Sym7","Sym12","Sym11","Sym9","Sym7","Sym10","Sym10","Sym8","Sym11","Sym4","Sym11","Sym11","Sym10","Sym3","Sym3","Sym11","Sym6","Sym3","Sym5","Sym4","Sym3","Sym1","Sym9","Sym6","Sym9","Sym7","Sym8","Sym9","Sym10","Sym6","Sym5","Sym11","Sym7","Sym10","Sym8","Sym8","Sym8","Sym6","Sym10","Sym5","Sym5","Sym10","Sym9","Sym5","Sym11","Sym5","Sym10","Sym8","Sym10","Sym7","Sym2","Sym4","Sym11","Sym7","Sym8","Sym11","Sym10","Sym11","Sym9","Sym9","Sym12","Sym10","Sym11","Sym4","Sym10"],
    ["Sym9","Sym6","Sym3","Sym10","Sym11","Sym6","Sym6","Sym5","Sym11","Sym8","Sym3","Sym7","Sym6","Sym11","Sym9","Sym2","Sym4","Sym5","Sym9","Sym11","Sym7","Sym9","Sym7","Sym11","Sym8","Sym10","Sym4","Sym8","Sym6","Sym9","Sym9","Sym8","Sym11","Sym3","Sym10","Sym10","Sym9","Sym10","Sym11","Sym5","Sym7","Sym4","Sym11","Sym10","Sym10","Sym6","Sym9","Sym9","Sym11","Sym10","Sym11","Sym5","Sym10","Sym5","Sym11","Sym4","Sym4","Sym6","Sym11","Sym9","Sym10","Sym9","Sym8","Sym7","Sym1","Sym8","Sym11","Sym5","Sym3","Sym5","Sym11","Sym7","Sym10","Sym8","Sym8","Sym8","Sym10","Sym10","Sym10","Sym11","Sym10","Sym7","Sym1","Sym11","Sym10","Sym4","Sym5","Sym2","Sym6","Sym9","Sym8","Sym7","Sym7","Sym7"]
  ]*/