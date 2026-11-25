import logging
import os
from urllib.parse import parse_qs, unquote, urlparse
import requests
from lxml import html as lxml_html

logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.getenv('TAVILY_API_KEY', '')


def _is_safe_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ('http', 'https') and bool(parsed.netloc)
    except Exception:
        return False


def _clean_duckduckgo_redirect(href: str) -> str:
    if not href:
        return ''
    if href.startswith('//'):
        href = 'https:' + href
    parsed = urlparse(href)
    if 'duckduckgo.com' in parsed.netloc and '/l/' in parsed.path:
        qs = parse_qs(parsed.query)
        if 'uddg' in qs and qs['uddg']:
            return unquote(qs['uddg'][0])
    return href


def _search_tavily(query: str, max_results: int) -> list:
    resp = requests.post(
        'https://api.tavily.com/search',
        json={
            'api_key': TAVILY_API_KEY,
            'query': query,
            'max_results': max_results,
            'search_depth': 'basic',
        },
        timeout=12,
    )
    resp.raise_for_status()
    data = resp.json()
    results = []
    for item in data.get('results', [])[:max_results]:
        url = item.get('url', '')
        if _is_safe_http_url(url):
            results.append({
                'title': (item.get('title') or url).strip(),
                'url': url,
                'snippet': (item.get('content') or '').strip()[:400],
                'source': urlparse(url).netloc,
            })
    return results


def _search_duckduckgo_html(query: str, max_results: int) -> list:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    }
    resp = requests.post(
        'https://html.duckduckgo.com/html/',
        data={'q': query},
        headers=headers,
        timeout=10,
    )
    if not resp.ok or not resp.text:
        return []

    tree = lxml_html.fromstring(resp.text)
    result_nodes = tree.xpath("//div[contains(@class, 'result__body')]")
    results = []
    for node in result_nodes:
        link_el = node.xpath(".//a[contains(@class, 'result__a')]")
        snippet_el = node.xpath(".//a[contains(@class, 'result__snippet')] | .//div[contains(@class, 'result__snippet')]")
        if not link_el:
            continue
        title = ''.join(link_el[0].itertext()).strip()
        href = _clean_duckduckgo_redirect(link_el[0].get('href', ''))
        snippet = ''.join(snippet_el[0].itertext()).strip() if snippet_el else ''
        if title and _is_safe_http_url(href):
            results.append({
                'title': title,
                'url': href,
                'snippet': snippet[:400],
                'source': urlparse(href).netloc,
            })
            if len(results) >= max_results:
                break
    return results


def _search_duckduckgo_instant_and_wikipedia(query: str, max_results: int) -> list:
    results = []
    # DuckDuckGo Instant Answer API
    try:
        resp = requests.get(
            'https://api.duckduckgo.com/',
            params={'q': query, 'format': 'json', 'no_html': '1', 'skip_disambig': '1'},
            timeout=8,
        )
        if resp.ok:
            data = resp.json()
            abstract_text = (data.get('AbstractText') or '').strip()
            abstract_url = (data.get('AbstractURL') or '').strip()
            heading = (data.get('Heading') or query).strip()
            if abstract_text and _is_safe_http_url(abstract_url):
                results.append({
                    'title': heading,
                    'url': abstract_url,
                    'snippet': abstract_text[:400],
                    'source': urlparse(abstract_url).netloc,
                })
            for topic in data.get('RelatedTopics', []):
                if isinstance(topic, dict) and topic.get('Text') and topic.get('FirstURL'):
                    url = topic['FirstURL']
                    if _is_safe_http_url(url):
                        results.append({
                            'title': topic['Text'].split(' - ')[0][:100],
                            'url': url,
                            'snippet': topic['Text'][:400],
                            'source': urlparse(url).netloc,
                        })
                        if len(results) >= max_results:
                            return results
    except Exception as e:
        logger.warning(f"DuckDuckGo instant search warning: {e}")

    # Wikipedia API fallback if still low on results
    if len(results) < max_results:
        try:
            wiki_resp = requests.get(
                'https://en.wikipedia.org/w/api.php',
                params={
                    'action': 'query',
                    'list': 'search',
                    'srsearch': query,
                    'format': 'json',
                    'srlimit': max_results - len(results),
                },
                headers={'User-Agent': 'PersonalAI-WebSearch/1.0'},
                timeout=8,
            )
            if wiki_resp.ok:
                search_items = wiki_resp.json().get('query', {}).get('search', [])
                for item in search_items:
                    title = item.get('title', '')
                    if not title:
                        continue
                    wiki_url = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
                    raw_snip = item.get('snippet', '')
                    clean_snip = lxml_html.fromstring(f"<span>{raw_snip}</span>").text_content().strip() if raw_snip else ''
                    results.append({
                        'title': f"{title} - Wikipedia",
                        'url': wiki_url,
                        'snippet': clean_snip[:400],
                        'source': 'en.wikipedia.org',
                    })
                    if len(results) >= max_results:
                        break
        except Exception as e:
            logger.warning(f"Wikipedia search warning: {e}")

    return results[:max_results]


def perform_web_search(query: str, max_results: int = 5) -> list:
    """
    Validate query and perform live web search across configured search providers.
    Returns list of {title, url, snippet, source}.
    """
    cleaned = (query or '').strip()
    if len(cleaned) < 2:
        raise ValueError("Search query must be at least 2 characters long.")
    if len(cleaned) > 300:
        cleaned = cleaned[:300]

    max_results = max(1, min(int(max_results or 5), 10))

    if TAVILY_API_KEY:
        try:
            tavily_results = _search_tavily(cleaned, max_results)
            if tavily_results:
                return tavily_results
        except Exception as e:
            logger.warning(f"Tavily search fallback triggered: {e}")

    try:
        ddg_results = _search_duckduckgo_html(cleaned, max_results)
        if ddg_results:
            return ddg_results
    except Exception as e:
        logger.warning(f"DuckDuckGo HTML search warning: {e}")

    return _search_duckduckgo_instant_and_wikipedia(cleaned, max_results)
