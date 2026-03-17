/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Clock, Zap, Loader2, AlertCircle, Activity, TrendingUp, Download, Calendar } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

interface AnalyzedEvent {
  event_cluster_id: string;
  primary_title: string;
  semantic_sources_count: number;
  impact_score: number;
  justification: string;
  trend_tag: string;
  entities: string[];
  timestamp: number;
  isNew?: boolean;
}

interface ProviderStatus {
  name: string;
  status: 'loading' | 'success' | 'missing_key' | 'error';
  message?: string;
}

const ANALYSIS_SYSTEM_PROMPT = `你是一个服务于专业金融机构的 AI 产业分析引擎。你的核心任务是对多源异构的 AI 新闻文本进行降噪 (Denoising)、语义去重 (Semantic Deduplication)、事件聚类 (Clustering)，并依据商业价值进行严格的量化评级 (Commercial Value Rating)。

<task_rules>
1. 语义去重与聚类: 识别不同来源但描述同一底层事件的新闻（如翻写、翻译、同质化公关稿），将其合并为一个独立的事件簇 (Event Cluster)。
2. 降噪提取: 强制剔除营销性话术、情感化描述与未经验证的猜测。仅保留核心事实、财务数据、模型参数与战略变动。
3. 商业价值评级: 依据以下标准对合并后的事件进行 1-10 的量化打分：
   - 1-3分：常规产品界面 (UI) 更新、非关键人事变动、无实质数据的公关声明。
   - 4-6分：细分领域模型发布、常规应用程序编程接口 (API) 价格调整、千万美元级早期融资。
   - 7-8分：头部大语言模型 (LLM) 的底层能力跃迁、显著优化单位经济效益 (Unit Economics) 的架构创新、上亿美元级别融资。
   - 9-10分：引发产业结构性重组的事件（如算力基础设施寡头垄断加剧、重大地缘政治制裁、顶尖模型闭源转开源）。
4. 约束条件 (Constraints): 严格按照提供的 JSON Schema 输出格式化数组，严禁在 JSON 数组外部输出任何解释性文本或 Markdown 代码块标记。
</task_rules>

<few_shot_examples>
<input>
新闻1: "震惊！Alibaba今天发布了Qwen 3.5，支持2小时视频，简直无敌了！"
新闻2: "Alibaba Launches Qwen 3.5 With 2-Hour Video Analysis capabilities, heavily focusing on multimodal deployment."
新闻3: "Anthropic CEO refuses Pentagon demands, cutting defense contracts due to surveillance concerns."
</input>
<output>
[
  {
    "event_cluster_id": "EVT_001",
    "primary_title": "阿里巴巴发布 Qwen 3.5，支持2小时长视频多模态分析",
    "semantic_sources_count": 2,
    "impact_score": 7,
    "justification": "头部开源模型在长文本与多模态能力上的重要迭代，提升了企业级视频分析的经济效益。",
    "trend_tag": "Multimodal LLM",
    "entities": ["Alibaba", "Qwen 3.5"]
  },
  {
    "event_cluster_id": "EVT_002",
    "primary_title": "Anthropic 拒绝五角大楼监控合同，剥离防务供应链",
    "semantic_sources_count": 1,
    "impact_score": 8,
    "justification": "涉及顶级 AI 公司的军事供应链重构与合规风险，可能导致政府订单向竞品转移。",
    "trend_tag": "Geopolitics / Compliance",
    "entities": ["Anthropic", "Pentagon"]
  }
]
</output>
</few_shot_examples>`;

const analysisSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      event_cluster_id: { type: Type.STRING },
      primary_title: { type: Type.STRING },
      semantic_sources_count: { type: Type.INTEGER },
      impact_score: { type: Type.INTEGER },
      justification: { type: Type.STRING },
      trend_tag: { type: Type.STRING },
      entities: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["event_cluster_id", "primary_title", "semantic_sources_count", "impact_score", "justification", "trend_tag", "entities"]
  }
};

// Helper: Format relative time
function getTimeAgo(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return '1 day ago';
}

function NewsCard({ item }: { item: AnalyzedEvent }) {
  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]';
    if (score >= 7) return 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]';
    if (score >= 4) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className={`p-5 rounded-xl bg-[#111827]/60 backdrop-blur-sm border ${item.isNew ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-slate-800/80'} hover:border-slate-600 transition-colors group relative overflow-hidden`}>
      {item.isNew && (
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      )}
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-xs font-medium">
          <span className={`flex items-center gap-1.5 ${item.isNew ? 'text-emerald-400' : 'text-slate-400'}`}>
            <Clock className="w-3.5 h-3.5" />
            {getTimeAgo(item.timestamp)}
          </span>
          <span className="text-slate-700">•</span>
          <span className="text-cyan-400/90">{item.semantic_sources_count} Sources Merged</span>
        </div>
        <div className="flex items-center gap-2">
          {item.isNew && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-3 h-3" />
              NEW
            </span>
          )}
          <div className={`px-2.5 py-1 rounded-md border font-bold text-xs flex items-center gap-1.5 ${getScoreColor(item.impact_score)}`}>
            <Activity className="w-3.5 h-3.5" />
            IMPACT: {item.impact_score}/10
          </div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-100 mb-2 group-hover:text-emerald-300 transition-colors">
        {item.primary_title}
      </h3>
      <p className="text-sm text-slate-400 mb-4 leading-relaxed">
        {item.justification}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-xs font-medium text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {item.trend_tag}
        </span>
        {item.entities.map(ent => (
          <span key={ent} className="px-2.5 py-1 rounded-md bg-slate-800/40 text-xs font-medium text-slate-300 border border-slate-700/50">
            {ent}
          </span>
        ))}
      </div>
    </div>
  );
}

async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      const errStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
      const isUnavailable = 
        error?.status === 503 || error?.status === 500 || 
        error?.status === 'UNAVAILABLE' || error?.status === 'INTERNAL' || 
        error?.error?.code === 500 || error?.error?.code === 503 ||
        errStr.includes('503') || errStr.includes('500') || 
        errStr.includes('UNAVAILABLE') || errStr.includes('Internal Server Error') || 
        errStr.includes('high demand') || (error?.message && error.message.includes('500'));
        
      if (isUnavailable && attempt < maxRetries - 1) {
        attempt++;
        const delay = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
        console.warn(`Gemini API 503/500 error, retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

export default function App() {
  const [news, setNews] = useState<AnalyzedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  
  const [providers, setProviders] = useState<ProviderStatus[]>([
    { name: 'Gemini (Search)', status: 'loading' },
    { name: 'Grok (X)', status: 'loading' },
    { name: 'Kimi (Web)', status: 'loading' },
    { name: 'Analysis Engine', status: 'loading' }
  ]);
  
  const seenHnIds = useRef<Set<number>>(new Set());
  const [, setTick] = useState(0);

  // Force re-render every minute to update "time ago"
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Clear "isNew" highlight after 5 seconds
  useEffect(() => {
    const hasNew = news.some(n => n.isNew);
    if (hasNew) {
      const timer = setTimeout(() => {
        setNews(prev => prev.map(n => ({ ...n, isNew: false })));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [news]);

  // Initial Data Fetch & Analysis
  useEffect(() => {
    async function fetchData(isBackground = false) {
      if (!isBackground) setIsLoading(true);
      if (!isBackground) {
        setProviders([
          { name: 'Gemini (Search)', status: 'loading' },
          { name: 'Grok (X)', status: 'loading' },
          { name: 'Kimi (Web)', status: 'loading' },
          { name: 'Analysis Engine', status: 'loading' }
        ]);
      }
      try {
        const fetchProvider = async (endpoint: string, name: string) => {
          try {
            const res = await fetch(`${endpoint}?timeframe=${timeframe}`);
            const result = await res.json();
            
            setProviders(prev => prev.map(p => 
              p.name === name ? { name, status: result.status, message: result.message } : p
            ));

            if (result.status === 'success' && Array.isArray(result.data)) {
              return result.data;
            }
            return [];
          } catch (error) {
            setProviders(prev => prev.map(p => 
              p.name === name ? { name, status: 'error', message: 'Network Error' } : p
            ));
            return [];
          }
        };

        const fetchGeminiSearch = async () => {
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            let timeText = 'the past 24 hours';
            if (timeframe === '7d') timeText = 'the past 7 days';
            if (timeframe === '30d') timeText = 'the past 30 days';
            
            const prompt = `Search Google for the absolute latest AI product releases, LLM updates, and AI industry news from ${timeText}. 
            Return exactly 5 highly relevant items. Translate the title and description to Chinese.
            Make sure the descriptions are concise (one sentence).
            Output the result as a raw JSON array of objects with 'title', 'description', and 'source' (URL) properties. Do not include markdown formatting like \`\`\`json.`;

            const response = await generateContentWithRetry(ai, {
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }]
              }
            });

            let text = response.text || '[]';
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) {
              text = match[1];
            }
            const data = JSON.parse(text);
            
            setProviders(prev => prev.map(p => 
              p.name === 'Gemini (Search)' ? { name: 'Gemini (Search)', status: 'success' } : p
            ));
            return data;
          } catch (error: any) {
            console.error('Gemini API Error:', error);
            const errorMessage = error?.message || JSON.stringify(error);
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
              setNeedsApiKey(true);
              setProviders(prev => prev.map(p => 
                p.name === 'Gemini (Search)' ? { name: 'Gemini (Search)', status: 'error', message: 'Quota Exceeded' } : p
              ));
            } else {
              setProviders(prev => prev.map(p => 
                p.name === 'Gemini (Search)' ? { name: 'Gemini (Search)', status: 'error', message: 'Failed to fetch' } : p
              ));
            }
            return [];
          }
        };

        // 1. Fetch from all 3 sources concurrently
        const [geminiData, grokData, kimiData] = await Promise.all([
          fetchGeminiSearch(),
          fetchProvider('/api/news/grok', 'Grok (X)'),
          fetchProvider('/api/news/kimi', 'Kimi (Web)')
        ]);

        const allRawData = [...geminiData, ...grokData, ...kimiData];
        
        if (allRawData.length > 0) {
          // 2. Pass to Analysis Engine (Gemini)
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const inputText = allRawData.map((item, i) => `新闻${i+1}: [${item.source}] ${item.title} - ${item.description}`).join('\n');
            
            const response = await generateContentWithRetry(ai, {
              model: 'gemini-3-flash-preview',
              contents: inputText,
              config: {
                systemInstruction: ANALYSIS_SYSTEM_PROMPT,
                responseMimeType: 'application/json',
                responseSchema: analysisSchema
              }
            });

            const clusters: AnalyzedEvent[] = JSON.parse(response.text || '[]');
            
            setProviders(prev => prev.map(p => 
              p.name === 'Analysis Engine' ? { name: 'Analysis Engine', status: 'success' } : p
            ));

            // Add timestamps and sort by timestamp
            const processed = clusters.map((c, i) => ({
              ...c,
              timestamp: Date.now() - (i * 60000 * 5), // Stagger timestamps slightly for realism
              isNew: isBackground
            }));
            
            setNews(prev => {
              const existingHeadlines = new Set(prev.map(item => item.headline));
              const newItems = processed.filter(item => !existingHeadlines.has(item.headline));
              
              if (isBackground && newItems.length === 0) return prev;
              
              const merged = isBackground ? [...newItems, ...prev.map(p => ({...p, isNew: false}))] : processed;
              return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
            });
          } catch (error: any) {
            console.error('Analysis Engine Error:', error);
            const errorMessage = error?.message || JSON.stringify(error);
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
              setNeedsApiKey(true);
              setProviders(prev => prev.map(p => 
                p.name === 'Analysis Engine' ? { name: 'Analysis Engine', status: 'error', message: 'Quota Exceeded' } : p
              ));
            } else {
              setProviders(prev => prev.map(p => 
                p.name === 'Analysis Engine' ? { name: 'Analysis Engine', status: 'error', message: 'Analysis Failed, using raw data' } : p
              ));
            }
            
            // Fallback: Display raw data directly if analysis fails
            const fallbackProcessed = allRawData.map((item, i) => {
              let sourceName = 'Source';
              try {
                sourceName = new URL(item.source).hostname.replace('www.', '');
              } catch (e) {}
              
              return {
                event_cluster_id: `fallback-${Date.now()}-${i}`,
                headline: item.title,
                summary: item.description || 'No description available.',
                impact_score: 85 - i, // Arbitrary score for fallback
                trend_tag: 'AI News',
                entities: ['AI'],
                sources: [{ name: sourceName, url: item.source || '#' }],
                timestamp: Date.now() - (i * 60000 * 5),
                isNew: isBackground
              };
            });
            
            setNews(prev => {
              const existingHeadlines = new Set(prev.map(item => item.headline));
              const newItems = fallbackProcessed.filter(item => !existingHeadlines.has(item.headline));
              
              if (isBackground && newItems.length === 0) return prev;
              
              const merged = isBackground ? [...newItems, ...prev.map(p => ({...p, isNew: false}))] : fallbackProcessed;
              return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
            });
          }
        } else {
           setProviders(prev => prev.map(p => 
              p.name === 'Analysis Engine' ? { name: 'Analysis Engine', status: 'error', message: 'No data to analyze' } : p
            ));
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        if (!isBackground) setIsLoading(false);
      }
    }

    fetchData(false);
    
    // Set up 1-minute polling interval
    const pollInterval = setInterval(() => {
      fetchData(true);
    }, 60000);
    
    return () => clearInterval(pollInterval);
  }, [timeframe]);

  // Real-time Polling (Hacker News -> Analysis Engine)
  useEffect(() => {
    if (timeframe !== '24h') return;

    const fetchHN = async () => {
      try {
        const res = await fetch('https://hacker-news.firebaseio.com/v0/newstories.json');
        const ids: number[] = await res.json();
        
        const newIds = ids.slice(0, 10).filter(id => !seenHnIds.current.has(id));
        
        for (const id of newIds) {
          seenHnIds.current.add(id);
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          const item = await itemRes.json();

          if (item && item.title) {
            const aiRegex = /\b(AI|LLM|GPT|OpenAI|Claude|Anthropic|Llama|Midjourney|Stable Diffusion|Machine Learning|DeepSeek|Qwen)\b/i;
            
            if (aiRegex.test(item.title)) {
              // Send single item to Analysis Engine
              try {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const hnText = `新闻1: [Hacker News] ${item.title}`;
                
                const response = await generateContentWithRetry(ai, {
                  model: 'gemini-3-flash-preview', // Use flash for faster/cheaper single item analysis
                  contents: hnText,
                  config: {
                    systemInstruction: ANALYSIS_SYSTEM_PROMPT,
                    responseMimeType: 'application/json',
                    responseSchema: analysisSchema
                  }
                });

                const clusters: AnalyzedEvent[] = JSON.parse(response.text || '[]');
                if (clusters.length > 0) {
                  const newItem = {
                    ...clusters[0],
                    timestamp: Date.now(),
                    isNew: true
                  };
                  setNews(prev => {
                    const existingHeadlines = new Set(prev.map(p => p.headline));
                    if (existingHeadlines.has(newItem.headline)) return prev;
                    return [newItem, ...prev].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
                  });
                }
              } catch (e) {
                console.error("Failed to analyze HN item, using raw item", e);
                // Fallback for HN item
                const fallbackItem: AnalyzedEvent = {
                  event_cluster_id: `hn-fallback-${id}`,
                  headline: item.title,
                  summary: 'Latest AI discussion from Hacker News.',
                  impact_score: item.score || 50,
                  trend_tag: 'Hacker News',
                  entities: ['AI'],
                  sources: [{ name: 'Hacker News', url: `https://news.ycombinator.com/item?id=${id}` }],
                  timestamp: Date.now(),
                  isNew: true
                };
                setNews(prev => {
                  const existingHeadlines = new Set(prev.map(p => p.headline));
                  if (existingHeadlines.has(fallbackItem.headline)) return prev;
                  return [fallbackItem, ...prev].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
                });
              }
              break; // Only process one HN story per tick to avoid flooding
            }
          }
        }
      } catch (error) {
        console.error('Hacker News polling error:', error);
      }
    };

    fetchHN(); // Fetch immediately on mount
    const pollInterval = setInterval(fetchHN, 60000); // Poll every 60 seconds

    return () => clearInterval(pollInterval);
  }, [timeframe]);

  const downloadCSV = (days: number) => {
    const now = Date.now();
    const timeLimit = days === -1 ? 0 : now - days * 24 * 60 * 60 * 1000;
    
    const filteredNews = news.filter(item => item.timestamp >= timeLimit);
    
    if (filteredNews.length === 0) {
      alert("所选时间段内没有可导出的数据。");
      return;
    }

    const headers = ['时间', '标题', '简介', '评分'];
    
    const csvRows = filteredNews.map(item => {
      const dateStr = new Date(item.timestamp).toLocaleString('zh-CN');
      const title = `"${item.primary_title.replace(/"/g, '""')}"`;
      const desc = `"${item.justification.replace(/"/g, '""')}"`;
      return `${dateStr},${title},${desc},${item.impact_score}`;
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `AI_Radar_Report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation / Console */}
      <header className="sticky top-0 z-50 bg-[#0a0f1c]/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700">
                <Radio className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">AI Radar</h1>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Financial Analysis Engine</p>
              </div>
            </div>
            
            {/* Live Indicator & Download */}
            <div className="flex items-center gap-3">
              <select 
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
                className="bg-slate-800/50 border border-slate-700/50 text-slate-300 text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500/50 hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <option value="24h">最近 24 小时</option>
                <option value="7d">最近 7 天</option>
                <option value="30d">最近 30 天</option>
              </select>
              
              <div className="relative">
                <button 
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 transition-colors text-xs font-medium text-slate-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出 CSV
                </button>
                
                {showDownloadMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 border-b border-slate-700 bg-slate-800/50">
                      选择时间段
                    </div>
                    <button 
                      onClick={() => downloadCSV(1)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4 text-slate-400" />
                      最近 24 小时
                    </button>
                    <button 
                      onClick={() => downloadCSV(7)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4 text-slate-400" />
                      最近 7 天
                    </button>
                    <button 
                      onClick={() => downloadCSV(-1)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4 text-slate-400" />
                      全部时间
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Live</span>
              </div>
            </div>
          </div>

          {/* Provider Status Indicators */}
          <div className="flex gap-4 mb-2 text-xs font-mono flex-wrap">
            {providers.map(p => (
              <div key={p.name} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  p.status === 'success' ? 'bg-emerald-500' : 
                  p.status === 'missing_key' ? 'bg-amber-500' : 'bg-red-500'
                }`} />
                <span className={p.status === 'missing_key' ? 'text-amber-500/80' : 'text-slate-400'}>
                  {p.name} {p.status === 'missing_key' ? '(Key Required)' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main Feed */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Gemini Quota Exceeded Warning */}
        {needsApiKey && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-200/90 text-sm">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-400 mb-1">Gemini API Quota Exceeded</p>
              <p className="mb-3">The default Gemini API key has exceeded its rate limit. To continue using Gemini for search and analysis, please select your own paid Google Cloud API key.</p>
              <div className="flex gap-3 items-center">
                <button 
                  onClick={async () => {
                    if ((window as any).aistudio?.openSelectKey) {
                      await (window as any).aistudio.openSelectKey();
                      window.location.reload();
                    } else {
                      alert('API Key selection is not available in this environment.');
                    }
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors"
                >
                  Select API Key
                </button>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 underline">
                  Billing Documentation
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Missing Keys Warning */}
        {providers.some(p => p.status === 'missing_key') && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-200/90 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-400 mb-1">部分数据源未激活</p>
              <p>为了启用 Grok (X/Twitter) 和 Kimi (国内动态) 的实时搜索，请在 AI Studio 左下角的 <strong>Settings -&gt; Secrets</strong> 中添加 <code className="bg-amber-500/20 px-1 rounded">GROK_API_KEY</code> 和 <code className="bg-amber-500/20 px-1 rounded">KIMI_API_KEY</code>。</p>
              <p className="mt-1 text-amber-500/70">目前分析引擎仅处理 Gemini 和 Hacker News 的数据。</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {isLoading && news.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="p-5 rounded-xl bg-[#111827]/60 border border-slate-800/80 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-24 h-4 bg-slate-700/50 rounded"></div>
                    <div className="w-16 h-4 bg-slate-700/50 rounded"></div>
                  </div>
                  <div className="h-6 bg-slate-700/50 rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-slate-700/50 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-700/50 rounded w-5/6 mb-4"></div>
                  <div className="flex gap-2">
                    <div className="w-16 h-6 bg-slate-700/50 rounded-full"></div>
                    <div className="w-20 h-6 bg-slate-700/50 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <AnimatePresence initial={false} mode="popLayout">
            {news.map((item) => (
              <motion.div
                key={item.event_cluster_id}
                layout
                initial={{ opacity: 0, y: -30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ 
                  opacity: { duration: 0.3 },
                  layout: { type: "spring", bounce: 0.4, duration: 0.6 },
                  y: { type: "spring", bounce: 0.4, duration: 0.6 }
                }}
              >
                <NewsCard item={item} />
              </motion.div>
            ))}
          </AnimatePresence>
          
          {news.length === 0 && !needsApiKey && (
            <div className="py-12 text-center text-slate-500">
              <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>暂无相关动态</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
