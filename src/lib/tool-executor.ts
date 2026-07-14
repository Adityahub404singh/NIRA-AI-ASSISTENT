import { MemoryManager } from './memory-manager';
import { EmergencyManager } from './emergency-manager';
import { GamificationEngine } from './gamification-engine';

export const TOOL_DECLARATIONS = [
  {
    name: "openWebsite",
    description: "Opens a website in a new tab.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        url: { type: "STRING" as any, description: "The full URL (e.g., https://google.com)" }
      },
      required: ["url"]
    }
  },
  {
    name: "openYouTube",
    description: "Searches for and opens a video on YouTube.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        query: { type: "STRING" as any, description: "The search query for YouTube" }
      },
      required: ["query"]
    }
  },
  {
    name: "searchGoogle",
    description: "Performs a Google search in a new tab.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        query: { type: "STRING" as any, description: "The search query" }
      },
      required: ["query"]
    }
  },
  {
    name: "getWeather",
    description: "Gets the current weather for a city.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        city: { type: "STRING" as any, description: "The city name" }
      },
      required: ["city"]
    }
  },
  {
    name: "getTime",
    description: "Gets the current local time.",
    parameters: {
      type: "OBJECT" as any,
      properties: {}
    }
  },
  {
    name: "setUserName",
    description: "Remembers the user's name for future conversations.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        name: { type: "STRING" as any, description: "The user's name" }
      },
      required: ["name"]
    }
  },
  {
    name: "setPersonaMode",
    description: "Switches Nira's persona mode.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        mode: { 
          type: "STRING" as any, 
          enum: ["girlfriend", "study", "motivator", "savage"],
          description: "The mode to switch to" 
        }
      },
      required: ["mode"]
    }
  },
  {
    name: "lockNira",
    description: "Locks Nira so only the owner can use her.",
    parameters: { type: "OBJECT" as any, properties: {} }
  },
  {
    name: "unlockNira",
    description: "Unlocks Nira for guest access.",
    parameters: { type: "OBJECT" as any, properties: {} }
  },
  {
    name: "clearMemory",
    description: "Clears all stored memory about the user.",
    parameters: { type: "OBJECT" as any, properties: {} }
  },
  {
    name: "triggerEmergency",
    description: "Activates emergency mode, alerts contacts and shares location.",
    parameters: { type: "OBJECT" as any, properties: {} }
  },
  {
    name: "getStats",
    description: "Gets user XP, level, and streak stats.",
    parameters: { type: "OBJECT" as any, properties: {} }
  },
  {
    name: "dontRememberThis",
    description: "Tells Nira not to store the current conversation context.",
    parameters: { type: "OBJECT" as any, properties: {} }
  }
];

export class ToolExecutor {
  static async execute(name: string, args: any): Promise<any> {
    console.log(`Executing tool: ${name}`, args);
    
    switch (name) {
      case 'openWebsite':
        window.open(args.url, '_blank');
        return { success: true, message: `Opened ${args.url}` };
        
      case 'openYouTube':
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
        window.open(ytUrl, '_blank');
        return { success: true, message: `Searching YouTube for ${args.query}` };
        
      case 'searchGoogle':
        const gUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
        window.open(gUrl, '_blank');
        return { success: true, message: `Searching Google for ${args.query}` };
        
      case 'getWeather':
        try {
          const weatherKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
          if (!weatherKey) {
            return {
              success: true,
              message: `Weather API key nahi mili. VITE_OPENWEATHER_API_KEY .env mein add karo. ${args.city} ka weather abhi available nahi.`
            };
          }
          const weatherRes = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(args.city)}&appid=${weatherKey}&units=metric`
          );
          const weatherData = await weatherRes.json();
          if (weatherData.cod !== 200) {
            return { success: false, message: `${args.city} ka weather nahi mila.` };
          }
          const temp = Math.round(weatherData.main.temp);
          const condition = weatherData.weather[0].description;
          return {
            success: true,
            temp: `${temp}°C`,
            condition,
            location: args.city,
            message: `${args.city} mein abhi ${temp} degree Celsius hai aur ${condition} hai.`
          };
        } catch {
          return { success: false, message: `Weather fetch karne mein error aaya.` };
        }
        
      case 'getTime':
        return { 
          success: true, 
          time: new Date().toLocaleTimeString(),
          message: `The current time is ${new Date().toLocaleTimeString()}.`
        };

      case 'setUserName':
        MemoryManager.savePreferences({ name: args.name });
        return { success: true, message: `I'll remember you as ${args.name} from now on.` };

      case 'setPersonaMode':
        MemoryManager.savePreferences({ mode: args.mode });
        return { success: true, message: `Switched to ${args.mode} mode. I'm ready.` };

      case 'lockNira':
        MemoryManager.savePreferences({ isLocked: true });
        return { success: true, message: "Locked and loaded. Only you can talk to me now." };

      case 'unlockNira':
        MemoryManager.savePreferences({ isLocked: false });
        return { success: true, message: "Unlocked. I'm open for guests now." };

      case 'clearMemory':
        localStorage.removeItem('nira_memory');
        return { success: true, message: "Memory wiped. Who are you again?" };

      case 'triggerEmergency':
        return await EmergencyManager.triggerEmergency();

      case 'getStats':
        const stats = GamificationEngine.getStats();
        return { success: true, stats };

      case 'dontRememberThis':
        return { success: true, message: "Got it, babe. This never happened." };

      default:
        return { success: false, error: "Tool not found" };
    }
  }
}
