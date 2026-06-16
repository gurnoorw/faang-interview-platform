/**
 * executor.js — Real Code Execution via Piston
 *
 * Piston is a free, open-source code execution engine maintained by
 * engineer-man: https://github.com/engineer-man/piston
 *
 * Public API endpoint: https://emkc.org/api/v2/piston
 *   • No API key required
 *   • Supports 60+ languages
 *   • 5 req/sec rate limit on the public instance
 *   • Self-hostable via Docker for production use
 *
 * Public API:
 *   CODE_RUNNER.run(code, lang)                  — execute code, return output
 *   CODE_RUNNER.runWithTests(code, lang, cases)  — run + compare against test cases
 *   CODE_RUNNER.getRuntimes()                    — fetch available language versions
 */

const CODE_RUNNER = (() => {
  const PISTON_URL    = 'https://emkc.org/api/v2/piston';
  const RUN_TIMEOUT   = 10_000;   // ms — kill runaway code
  const COMPILE_TIMEOUT = 15_000; // ms

  /* ── Language mapping: our selector values → Piston identifiers ─────── */
  // version: "*" = use latest available on Piston (more future-proof than
  // pinning specific version strings which can fall behind as Piston updates)
  const LANG = {
    python:     { name: 'python',     version: '*', ext: 'py'   },
    java:       { name: 'java',       version: '*', ext: 'java' },
    cpp:        { name: 'c++',        version: '*', ext: 'cpp'  },
    javascript: { name: 'javascript', version: '*', ext: 'js'   },
  };

  /* ── Cached runtimes (fetched once) ────────────────────────────────── */
  let _runtimesCache = null;

  /* ═══════════════════════════════════════════════════════════════════════
     CORE EXECUTION
  ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Execute code and return real output.
   *
   * @param {string} code   — source code to execute
   * @param {string} lang   — 'python' | 'java' | 'cpp' | 'javascript'
   * @param {string} stdin  — optional stdin fed to the program
   * @returns {Promise<ExecutionResult>}
   *
   * ExecutionResult:
   *   { stdout, stderr, exitCode, signal, compileErr, language, version, ms }
   *   | { error: string }   on network / config failure
   */
  async function run(code, lang, stdin = '') {
    const mapping = LANG[lang];
    if (!mapping) return { error: `Unsupported language: ${lang}` };

    const t0   = Date.now();
    const body = {
      language:         mapping.name,
      version:          mapping.version,
      files:            [{ name: `solution.${mapping.ext}`, content: code }],
      stdin:            stdin,
      run_timeout:      RUN_TIMEOUT,
      compile_timeout:  COMPILE_TIMEOUT,
      run_memory_limit: 256_000_000,  // 256 MB
    };

    try {
      const res = await fetch(`${PISTON_URL}/execute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        // Piston returns 400 for bad language/version, 422 for bad body
        const err = await res.json().catch(() => ({}));
        return { error: `Piston ${res.status}: ${err.message || res.statusText}` };
      }

      const data     = await res.json();
      const compile  = data.compile || {};
      const runData  = data.run     || {};

      return {
        stdout:     runData.stdout   || '',
        stderr:     runData.stderr   || '',
        exitCode:   runData.code     ?? -1,
        signal:     runData.signal   || null,
        compileErr: compile.stderr   || compile.output || '',
        language:   data.language,
        version:    data.version,
        ms:         Date.now() - t0,
      };

    } catch (e) {
      // Network failure, CORS issue, etc.
      return { error: `Network error reaching Piston: ${e.message}` };
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TEST CASE RUNNER
     Injects a language-specific test harness around the user's code,
     executes via Piston, and returns structured pass/fail results.
  ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Run user code against an array of test cases.
   *
   * @param {string} code
   * @param {string} lang
   * @param {Array<{input:string, expected:string}>} cases
   * @returns {Promise<TestRunResult>}
   *
   * TestRunResult:
   *   { results: [{passed, got, expected, error}], passed, total, raw }
   *   | { error: string }
   */
  async function runWithTests(code, lang, cases) {
    if (!cases || cases.length === 0) return { error: 'No test cases provided.' };

    let wrapped, stdin = '';

    if (lang === 'python') {
      wrapped = _wrapPython(code, cases);
    } else if (lang === 'javascript') {
      wrapped = _wrapJavaScript(code, cases);
    } else {
      // For Java / C++, we can't reliably inject — run as-is and show raw output.
      // The user should write a main() that reads from stdin.
      const result = await run(code, lang);
      return { raw: result, message: `Test auto-runner only supports Python and JavaScript. For ${lang.toUpperCase()}, write a main() that prints to stdout and check the output manually.` };
    }

    const result = await run(wrapped, lang, stdin);
    if (result.error) return result;

    // Parse the special-format output emitted by our harness
    return _parseTestOutput(result, cases.length);
  }

  /* ── Python test harness ─────────────────────────────────────────────── */

  function _wrapPython(code, cases) {
    // Extract the first top-level function name defined in user code
    const fnMatch = code.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/m);
    const fnName  = fnMatch ? fnMatch[1] : null;

    const casesJson = JSON.stringify(cases.map(c => ({
      input:    c.input    || '',
      expected: c.expected || '',
    })));

    const harness = `
# ═══ PLATFORM TEST HARNESS (injected) ═══
import json as _j_, sys as _s_

_CASES_ = _j_.loads(${JSON.stringify(casesJson)})
_PASS_  = 0

${fnName ? `_FN_ = ${fnName}` : `
# No function detected — looking for any callable defined in user code
_CALLABLES_ = {k: v for k, v in list(globals().items())
               if callable(v) and not k.startswith('_') and k not in dir(__builtins__)}
_FN_ = next(iter(_CALLABLES_.values()), None)
`}

if _FN_ is None:
    print("⚠️  No solution function found. Did you define a function?")
    _s_.exit(1)

def _norm_(v):
    """Normalize output for comparison: sort inner lists where order doesn't matter."""
    if isinstance(v, list):
        try: return sorted(v)
        except TypeError: return v
    return v

for _i_, _tc_ in enumerate(_CASES_):
    _ns_ = {}
    # Parse "var = val; var2 = val2" style input
    for _stmt_ in _tc_['input'].replace('\\n', '; ').split(';'):
        _st_ = _stmt_.strip()
        if _st_:
            try: exec(_st_, _ns_)
            except Exception as _pe_: pass
    _kw_ = {k: v for k, v in _ns_.items() if not k.startswith('_')}
    try:
        _exp_ = eval(_tc_['expected'])
        _got_ = _FN_(**_kw_)
        _ok_  = _got_ == _exp_ or _norm_(_got_) == _norm_(_exp_) or str(_got_) == str(_exp_)
        _PASS_ += int(_ok_)
        _icon_ = "PASS" if _ok_ else "FAIL"
        print(f"__TC__{_i_+1}__{_icon_}__got={_got_!r}__exp={_exp_!r}")
    except Exception as _e_:
        print(f"__TC__{_i_+1}__ERROR__msg={_e_!r}__exp={_tc_['expected']!r}")

print(f"__SUMMARY__{_PASS_}__{len(_CASES_)}")
# ═══ END HARNESS ═══`;

    return code + '\n' + harness;
  }

  /* ── JavaScript test harness ─────────────────────────────────────────── */

  function _wrapJavaScript(code, cases) {
    const fnMatch = code.match(/^(?:function\s+([a-zA-Z_][a-zA-Z0-9_]*)|(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:function|\())/m);
    const fnName  = fnMatch ? (fnMatch[1] || fnMatch[2]) : null;

    const casesJson = JSON.stringify(cases);

    const harness = `
// ═══ PLATFORM TEST HARNESS (injected) ═══
(function() {
  const _cases = ${casesJson};
  ${fnName ? `const _fn = ${fnName};` : `
  // Try to find the most recently defined function
  const _fn = typeof solution !== 'undefined' ? solution
            : typeof twoSum   !== 'undefined' ? twoSum
            : null;
  `}

  if (!_fn) {
    console.log('⚠️  No solution function detected. Name your function or assign it to a variable.');
    process.exit(1);
  }

  function _norm(v) {
    if (Array.isArray(v)) { try { return [...v].sort((a,b)=>a-b); } catch(e) { return v; } }
    return v;
  }

  let _pass = 0;
  _cases.forEach((tc, i) => {
    try {
      // Execute input string to create variables
      const _ns = {};
      const _stmts = tc.input.split(/[;\\n]+/).filter(Boolean);
      _stmts.forEach(s => { try { eval(\`const \${s.trim()}\`); } catch(e) {} });

      // Call function with eval-created args — fallback: pass raw input string
      let _got;
      try { _got = eval(\`_fn(\${tc.input.replace(/=/g,'').replace(/[a-z_]+ /g,'').trim()})\`); }
      catch(e) { _got = String(e); }

      const _exp = eval(tc.expected);
      const _ok  = JSON.stringify(_norm(_got)) === JSON.stringify(_norm(_exp))
                || String(_got) === String(_exp);
      _pass += _ok ? 1 : 0;
      const icon = _ok ? 'PASS' : 'FAIL';
      console.log(\`__TC__\${i+1}__\${icon}__got=\${JSON.stringify(_got)}__exp=\${JSON.stringify(_exp)}\`);
    } catch(e) {
      console.log(\`__TC__\${i+1}__ERROR__msg=\${JSON.stringify(String(e))}__exp=\${JSON.stringify(tc.expected)}\`);
    }
  });
  console.log(\`__SUMMARY__\${_pass}__\${_cases.length}\`);
})();
// ═══ END HARNESS ═══`;

    return code + '\n' + harness;
  }

  /* ── Parse harness output into structured results ─────────────────────── */

  function _parseTestOutput(execResult, totalCases) {
    const lines   = (execResult.stdout + '\n' + execResult.stderr).split('\n');
    const results = [];
    let passed    = 0;
    let total     = totalCases;

    for (const line of lines) {
      if (line.startsWith('__TC__')) {
        // Format: __TC__<n>__PASS|FAIL|ERROR__got=<val>__exp=<val>
        const parts = line.split('__').filter(Boolean);
        // parts[0]='TC', parts[1]=n, parts[2]=status, parts[3]='got=...', parts[4]='exp=...'
        const n      = parseInt(parts[1]) - 1;
        const status = parts[2];
        const gotStr = (parts[3] || '').replace(/^got=/, '');
        const expStr = (parts[4] || '').replace(/^exp=/, '');
        const msgStr = (parts[3] || '').replace(/^msg=/, '');

        if (status === 'PASS') {
          results[n] = { passed: true,  got: gotStr, expected: expStr };
          passed++;
        } else if (status === 'FAIL') {
          results[n] = { passed: false, got: gotStr, expected: expStr };
        } else {
          results[n] = { passed: false, error: msgStr, expected: expStr };
        }
      } else if (line.startsWith('__SUMMARY__')) {
        const parts = line.split('__').filter(Boolean);
        passed = parseInt(parts[1]) || 0;
        total  = parseInt(parts[2]) || totalCases;
      }
    }

    // Filter any user stdout (lines not matching harness format)
    const userStdout = lines
      .filter(l => !l.startsWith('__TC__') && !l.startsWith('__SUMMARY__'))
      .join('\n')
      .trim();

    return {
      results,
      passed,
      total,
      userStdout,
      raw: execResult,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RUNTIME DISCOVERY
  ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Fetch available language runtimes from Piston.
   * Cached after first call — call once on app init if you want version info.
   */
  async function getRuntimes() {
    if (_runtimesCache) return _runtimesCache;
    try {
      const res  = await fetch(`${PISTON_URL}/runtimes`);
      const data = await res.json();
      _runtimesCache = data;
      return data;
    } catch (e) {
      console.warn('[executor] Could not fetch Piston runtimes:', e);
      return [];
    }
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  return { run, runWithTests, getRuntimes, LANG };
})();
