# Consented real-case submission template

Inspectrum currently publishes synthetic examples only. Use this template if you want to offer a real plan for a future reproducible case study. Submission does not guarantee publication.

Do not open a public issue with unredacted material. Start with a short description and use a private channel agreed with the maintainer for any source artifact that is not already public.

## 1. Authority and consent

Copy this section and complete every item:

```text
Submitter name or handle:
Private contact method:
Organization, if applicable:

I created this plan or am authorized by its owner to submit it: yes / no
I have authority to permit publication of the redacted material: yes / no
The plan is already public: yes / no
Public source URL, if any:

Allowed public artifacts (select each explicitly):
[ ] redacted original plan
[ ] exact Inspectrum request/configuration
[ ] raw reviewer output
[ ] Inspectrum report and verdict
[ ] revised plan
[ ] timing and operational errors
[ ] project or organization name

Required attribution:
Required embargo date, if any:
Additional restrictions:

I understand that, after publication in a Git repository, removal from forks,
caches or third-party archives cannot be guaranteed: yes / no
Consent date and timezone:
Signature or verifiable account confirmation:
```

Consent must be affirmative, attributable and retained with the private source record. Silence, repository visibility or a third party's submission is not consent.

## 2. Minimal reproduction record

```text
Inspectrum version or commit:
Installation source (npm, release asset, source checkout):
Host and version (Claude Code, Codex, other MCP host):
Reviewer CLI versions:
Exact model IDs or aliases reported at runtime:
Reasoning effort and relevant configuration:
Command or host action that triggered the review:
Date, timezone and duration:
Number of repetitions:
Operational errors:
Expected issue categories, fixed before review if evaluating detection:
```

Do not add expected labels to prompts evaluated by the reviewer.

## 3. Anonymization checklist

Work from a copy. Keep the original and its hash outside the public repository.

- [ ] Remove secrets, credentials, tokens, cookies and private keys.
- [ ] Remove personal names, emails, usernames, customer identifiers and ticket IDs.
- [ ] Replace private repository, branch, host, region and filesystem names consistently.
- [ ] Generalize business quantities only when the exact value is not material to the finding.
- [ ] Preserve technical relationships required to reproduce the issue.
- [ ] Review code blocks, URLs, logs, image metadata and filenames separately.
- [ ] Record every transformation and hash the source and redacted copy.
- [ ] Have the submitter approve the final redacted artifact and wording.
- [ ] Confirm that third-party material is licensed or excluded.

Anonymization can change the difficulty or meaning of a plan. Document that limitation instead of claiming equivalence.

## 4. Publication record

If accepted, the public case should state:

- that it is a consented, anonymized real case;
- who supplied it, or that attribution was withheld at the submitter's request;
- which fields were transformed;
- versions, configuration, prompts, repetitions and raw outputs;
- expected categories and how they were established;
- detections, misses, false alarms, operational failures and latency;
- whether the submitter reviewed the final text;
- the date and scope of consent.

Never turn one submitted plan into a general benchmark, testimonial or user-count claim.
