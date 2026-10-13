#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A match candidate's audio preview, fetched through the engine (DEC-012, DEC-066).

With the network and the candidate store replaced by recorders, so nothing
reaches Beatport:

- **Only Beatport's sample host, over HTTPS**, is ever requested, and a redirect
  is never followed.
- **An 8 MB cap**: a longer sample is refused, not truncated.
- **A candidate stored without a preview** has its page read once through the
  gate; what it names is held in memory and the stored candidate is not touched.
- **The last eight previews are kept in memory**, and no more.
- **Offline is an empty state**: nothing, not an error, and not asked again at
  once.
- **A fixture answers end-to-end tests** (CLEAN-14).
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Dict, List, Optional
from unittest import mock

import pytest

from cuepoint.data import beatport_fixture
from cuepoint.services import candidate_preview as module
from cuepoint.services.artwork_service import RETRY_FAILED_AFTER_SECONDS, FetchGate
from cuepoint.services.candidate_preview import (
    MAX_PREVIEW_BYTES,
    PreviewAudio,
    PREVIEW_CACHE_SIZE,
    CandidatePreviewService,
    CatalogPreviewService,
    fetch_preview,
    lookup_page_preview,
)

AUDIO = b"ID3" + b"\x00" * 64


def sample(name: str) -> str:
    return f"https://geo-samples.beatport.com/track/{name}.LOFI.mp3"


def page_of(number: int) -> str:
    return f"https://www.beatport.com/track/a-title/{number}"


class Candidates:
    """Stored candidates by id: the page, and the preview the matcher recorded."""

    def __init__(self) -> None:
        self.rows: Dict[int, SimpleNamespace] = {}

    def add(self, cid: int, preview_url: Optional[str]) -> int:
        self.rows[cid] = SimpleNamespace(
            id=cid, url=page_of(cid), preview_url=preview_url
        )
        return cid

    def get_candidate(self, candidate_id: int):
        return self.rows.get(candidate_id)


class Web:
    def __init__(self) -> None:
        self.audio: Dict[str, Optional[bytes]] = {}
        self.pages: Dict[str, Optional[str]] = {}
        self.fetched: List[str] = []
        self.looked_up: List[str] = []

    def fetch(self, url: str) -> Optional[bytes]:
        self.fetched.append(url)
        found = self.audio.get(url)
        return None if found is None else PreviewAudio(found)

    def lookup(self, page: str) -> Optional[str]:
        self.looked_up.append(page)
        return self.pages.get(page)


class Clock:
    now = 1_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def candidates() -> Candidates:
    return Candidates()


@pytest.fixture
def web() -> Web:
    return Web()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def service(candidates, web, clock) -> CandidatePreviewService:
    return CandidatePreviewService(
        candidates,
        gate=FetchGate(monotonic=clock),
        fetcher=web.fetch,
        page_lookup=web.lookup,
    )


@pytest.mark.unit
class TestServing:
    def test_a_stored_preview_is_fetched_once_and_then_served_from_memory(
        self, service, candidates, web
    ):
        cid = candidates.add(1, sample("one"))
        web.audio[sample("one")] = AUDIO

        assert service.preview(cid) == PreviewAudio(AUDIO)
        assert service.preview(cid) == PreviewAudio(AUDIO)

        assert web.fetched == [sample("one")]
        assert web.looked_up == []

    def test_an_unknown_candidate_is_a_lookup_error(self, service):
        with pytest.raises(LookupError):
            service.preview(404)

    def test_a_preview_off_beatports_sample_host_is_never_fetched(
        self, service, candidates, web
    ):
        for cid, url in enumerate(
            [
                "https://evil.example/a.mp3",
                "http://geo-samples.beatport.com/a.mp3",
                "https://geo-media.beatport.com/a.mp3",
            ],
            start=1,
        ):
            candidates.add(cid, url)
            assert service.preview(cid) is None

        assert web.fetched == []

    def test_a_candidate_with_no_stored_preview_has_its_page_read_once(
        self, service, candidates, web
    ):
        cid = candidates.add(1, None)
        web.pages[page_of(1)] = sample("found")
        web.audio[sample("found")] = AUDIO

        assert service.preview(cid) == PreviewAudio(AUDIO)

        assert web.looked_up == [page_of(1)]
        assert web.fetched == [sample("found")]
        assert candidates.rows[cid].preview_url is None

    def test_what_a_page_named_is_remembered_when_the_audio_is_evicted(
        self, candidates, web, clock
    ):
        service = CandidatePreviewService(
            candidates,
            gate=FetchGate(monotonic=clock),
            fetcher=web.fetch,
            page_lookup=web.lookup,
            limit=1,
        )
        first = candidates.add(1, None)
        second = candidates.add(2, sample("two"))
        web.pages[page_of(1)] = sample("one")
        web.audio[sample("one")] = AUDIO
        web.audio[sample("two")] = AUDIO

        service.preview(first)
        service.preview(second)
        service.preview(first)

        assert web.looked_up == [page_of(1)]
        assert web.fetched == [sample("one"), sample("two"), sample("one")]

    def test_a_page_with_no_sample_is_nothing_and_asked_once(
        self, service, candidates, web
    ):
        cid = candidates.add(1, None)
        web.pages[page_of(1)] = ""

        assert service.preview(cid) is None
        assert service.preview(cid) is None

        assert web.looked_up == [page_of(1)]
        assert web.fetched == []

    def test_a_page_that_cannot_be_read_is_nothing(self, service, candidates, web):
        cid = candidates.add(1, None)

        assert service.preview(cid) is None
        assert web.fetched == []

    def test_a_page_naming_a_sample_off_the_host_is_not_followed(
        self, service, candidates, web
    ):
        cid = candidates.add(1, None)
        web.pages[page_of(1)] = "https://evil.example/a.mp3"

        assert service.preview(cid) is None
        assert web.fetched == []

    def test_offline_is_empty_and_not_asked_again_until_later(
        self, service, candidates, web, clock
    ):
        cid = candidates.add(1, sample("one"))

        assert service.preview(cid) is None
        assert service.preview(cid) is None
        assert web.fetched == [sample("one")]

        clock.now += RETRY_FAILED_AFTER_SECONDS
        web.audio[sample("one")] = AUDIO
        assert service.preview(cid) == PreviewAudio(AUDIO)
        assert len(web.fetched) == 2

    def test_only_the_last_eight_previews_are_kept(self, service, candidates, web):
        assert PREVIEW_CACHE_SIZE == 8
        for cid in range(1, 11):
            candidates.add(cid, sample(str(cid)))
            web.audio[sample(str(cid))] = AUDIO + bytes([cid])
            service.preview(cid)
        web.fetched.clear()

        service.preview(10)
        service.preview(3)
        assert web.fetched == []

        service.preview(1)
        assert web.fetched == [sample("1")]

    def test_a_recently_used_preview_outlives_an_older_one(
        self, service, candidates, web
    ):
        for cid in range(1, 9):
            candidates.add(cid, sample(str(cid)))
            web.audio[sample(str(cid))] = AUDIO
            service.preview(cid)
        service.preview(1)
        candidates.add(9, sample("9"))
        web.audio[sample("9")] = AUDIO
        service.preview(9)
        web.fetched.clear()

        service.preview(1)
        assert web.fetched == []
        service.preview(2)
        assert web.fetched == [sample("2")]


def response(status: int = 200, chunks=(AUDIO,), headers=None) -> mock.MagicMock:
    made = mock.MagicMock(status_code=status)
    made.__enter__.return_value = made
    made.headers = headers or {}
    made.iter_content.side_effect = lambda _size: iter(chunks)
    return made


@pytest.mark.unit
class TestTheNetworkEdges:
    def test_a_url_off_beatports_sample_host_is_not_requested(self):
        with mock.patch("requests.get") as get:
            assert fetch_preview("https://evil.example/a.mp3") is None
            assert fetch_preview("https://geo-media.beatport.com/a.mp3") is None
            assert fetch_preview("http://geo-samples.beatport.com/a.mp3") is None
        get.assert_not_called()

    def test_a_preview_is_requested_without_following_redirects(self):
        with mock.patch("requests.get", return_value=response()) as get:
            assert fetch_preview(sample("a")) == PreviewAudio(AUDIO)

        assert get.call_args.kwargs["allow_redirects"] is False
        assert get.call_args.kwargs["stream"] is True
        assert get.call_args.kwargs["timeout"] == module.PREVIEW_FETCH_TIMEOUT

    @pytest.mark.parametrize("status", [301, 302, 403, 404, 500])
    def test_anything_but_ok_is_no_preview(self, status):
        with mock.patch("requests.get", return_value=response(status)):
            assert fetch_preview(sample("a")) is None

    def test_a_network_error_is_no_preview(self):
        with mock.patch("requests.get", side_effect=OSError("offline")):
            assert fetch_preview(sample("a")) is None

    def test_a_sample_over_the_cap_is_refused_not_truncated(self):
        chunk = b"x" * (1024 * 1024)
        served: List[int] = []

        def chunks(_size):
            for number in range(64):
                served.append(number)
                yield chunk

        made = response()
        made.iter_content.side_effect = chunks
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("big")) is None

        assert MAX_PREVIEW_BYTES == 8 * 1024 * 1024
        assert len(served) <= 9

    def test_a_sample_exactly_at_the_cap_is_served(self):
        with mock.patch(
            "requests.get", return_value=response(chunks=(b"x" * MAX_PREVIEW_BYTES,))
        ):
            data = fetch_preview(sample("edge"))

        assert data is not None and len(data.data) == MAX_PREVIEW_BYTES

    def test_a_declared_length_over_the_cap_is_refused_unread(self):
        made = response(headers={"Content-Length": str(MAX_PREVIEW_BYTES + 1)})
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("big")) is None
        made.iter_content.assert_not_called()

    @pytest.mark.parametrize("kind", ["text/html; charset=utf-8", "image/jpeg"])
    def test_a_page_or_picture_in_place_of_audio_is_no_preview(self, kind):
        made = response(headers={"Content-Type": kind})
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("a")) is None

    @pytest.mark.parametrize("kind", ["audio/mpeg", "application/octet-stream", None])
    def test_audio_or_an_unnamed_type_is_served(self, kind):
        made = response(headers={"Content-Type": kind} if kind else {})
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("a")) == PreviewAudio(AUDIO)

    def test_the_upstream_audio_type_labels_the_preview(self):
        made = response(headers={"Content-Type": "audio/mp4; codecs=x"})
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("a")) == PreviewAudio(AUDIO, "audio/mp4")

    def test_an_octet_stream_is_labelled_mpeg(self):
        made = response(headers={"Content-Type": "application/octet-stream"})
        with mock.patch("requests.get", return_value=made):
            assert fetch_preview(sample("a")).content_type == "audio/mpeg"

    def test_the_url_requested_is_rebuilt_and_an_ambiguous_one_is_not_requested(self):
        with mock.patch("requests.get", return_value=response()) as get:
            fetch_preview(sample("a") + "#frag")
            assert (
                fetch_preview("https://evil.com\\@geo-samples.beatport.com/a.mp3")
                is None
            )
            assert fetch_preview("https://user@geo-samples.beatport.com/a.mp3") is None
            assert fetch_preview("https://geo-samples.beatport.com:8443/a.mp3") is None
        assert get.call_count == 1
        assert get.call_args.args[0] == sample("a")

    def test_an_empty_body_is_no_preview(self):
        with mock.patch("requests.get", return_value=response(chunks=())):
            assert fetch_preview(sample("a")) is None

    def test_the_page_lookup_says_sample_none_or_unread(self):
        from bs4 import BeautifulSoup

        from cuepoint.data import beatport

        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "queryKey": ["track-details-1"],
                                "state": {"data": {"sample_url": sample("p")}},
                            }
                        ]
                    }
                }
            }
        }
        with_sample = BeautifulSoup(
            f'<script id="__NEXT_DATA__">{json.dumps(data)}</script>', "lxml"
        )
        without = BeautifulSoup("<html></html>", "lxml")
        with mock.patch.object(beatport, "request_html", return_value=with_sample):
            assert lookup_page_preview(page_of(1)) == sample("p")
        with mock.patch.object(beatport, "request_html", return_value=without):
            assert lookup_page_preview(page_of(1)) == ""
        with mock.patch.object(beatport, "request_html", return_value=None):
            assert lookup_page_preview(page_of(1)) is None
        with mock.patch.object(beatport, "request_html", side_effect=OSError("off")):
            assert lookup_page_preview(page_of(1)) is None


@pytest.mark.unit
class TestTheFixture:
    def test_a_fixture_answers_instead_of_the_network(self, tmp_path, monkeypatch):
        (tmp_path / "t.mp3").write_bytes(AUDIO)
        path = tmp_path / "fixture.json"
        path.write_text(json.dumps({"previews": {sample("t"): "t.mp3"}}), "utf-8")
        monkeypatch.setenv(beatport_fixture.ENV_VAR, str(path))

        with mock.patch("requests.get") as get:
            assert fetch_preview(sample("t")) == PreviewAudio(AUDIO)
            assert fetch_preview(sample("unlisted")) is None
        get.assert_not_called()

    def test_an_off_host_url_is_still_refused_before_the_fixture(
        self, tmp_path, monkeypatch
    ):
        (tmp_path / "t.mp3").write_bytes(AUDIO)
        path = tmp_path / "fixture.json"
        path.write_text(
            json.dumps({"previews": {"https://evil.example/t.mp3": "t.mp3"}}), "utf-8"
        )
        monkeypatch.setenv(beatport_fixture.ENV_VAR, str(path))

        assert fetch_preview("https://evil.example/t.mp3") is None


# ------------------------------------------------------------ catalog tracks


class Samples:
    """The API's answer for a catalog track, counting every ask."""

    def __init__(self) -> None:
        self.names: dict[int, str] = {}
        self.asked: list[int] = []
        self.fail = False

    def __call__(self, track_id: int) -> str:
        self.asked.append(track_id)
        if self.fail:
            raise RuntimeError("no token")
        return self.names.get(track_id, "")


@pytest.fixture
def samples() -> Samples:
    return Samples()


@pytest.fixture
def catalog(samples, web, clock) -> CatalogPreviewService:
    return CatalogPreviewService(
        gate=FetchGate(monotonic=clock),
        fetcher=web.fetch,
        sample_lookup=samples,
        page_lookup=web.lookup,
    )


@pytest.mark.unit
class TestCatalogPreview:
    def test_audio_comes_from_the_looked_up_sample(self, catalog, samples, web):
        samples.names[7] = sample("seven")
        web.audio[sample("seven")] = AUDIO

        assert catalog.preview(7) == PreviewAudio(AUDIO)
        assert web.fetched == [sample("seven")]

    def test_no_sample_is_nothing_and_nothing_is_fetched(self, catalog, samples, web):
        samples.names[7] = ""
        assert catalog.preview(7) is None
        assert web.fetched == []

    def test_a_sample_off_beatports_host_is_never_fetched(self, catalog, samples, web):
        samples.names[7] = "https://evil.example.com/a.mp3"
        web.audio["https://evil.example.com/a.mp3"] = AUDIO
        assert catalog.preview(7) is None
        assert web.fetched == []

    @pytest.mark.parametrize("bad", [0, -3, "x", 2**31, 10**13])
    def test_an_invalid_id_is_a_lookup_error(self, catalog, samples, bad):
        with pytest.raises(LookupError):
            catalog.preview(bad)
        assert samples.asked == []

    def test_a_second_call_is_served_from_memory(self, catalog, samples, web):
        samples.names[7] = sample("seven")
        web.audio[sample("seven")] = AUDIO

        catalog.preview(7)
        catalog.preview(7)

        assert web.fetched == [sample("seven")]
        assert samples.asked == [7]

    def test_only_the_last_eight_are_kept(self, catalog, samples, web):
        for n in range(1, PREVIEW_CACHE_SIZE + 2):
            samples.names[n] = sample(str(n))
            web.audio[sample(str(n))] = AUDIO
            catalog.preview(n)
        catalog.preview(1)
        assert web.fetched.count(sample("1")) == 2

    def test_an_oversized_body_is_refused_by_the_real_fetcher(self):
        big = response(chunks=(b"x" * (MAX_PREVIEW_BYTES + 1),))
        service = CatalogPreviewService(sample_lookup=lambda _id: sample("big"))
        with mock.patch("requests.get", return_value=big):
            assert service.preview(9) is None

    def test_an_api_failure_falls_back_to_the_public_page(self, catalog, samples, web):
        samples.fail = True
        web.pages["https://www.beatport.com/track/t/7"] = sample("seven")
        web.audio[sample("seven")] = AUDIO

        assert catalog.preview(7) == PreviewAudio(AUDIO)
        assert web.looked_up == ["https://www.beatport.com/track/t/7"]

    def test_an_api_failure_and_an_unreadable_page_is_nothing(
        self, catalog, samples, web
    ):
        samples.fail = True
        assert catalog.preview(7) is None
        assert web.fetched == []

    def test_a_no_sample_answer_from_the_api_is_final(self, catalog, samples):
        samples.names[7] = ""
        assert catalog.preview(7) is None
        assert catalog.preview(7) is None
        assert samples.asked == [7]

    def test_a_failure_is_not_asked_again_until_the_window_passes(
        self, catalog, samples, web, clock
    ):
        samples.fail = True
        assert catalog.preview(7) is None
        clock.now += RETRY_FAILED_AFTER_SECONDS - 1
        assert catalog.preview(7) is None
        assert samples.asked == [7]
        assert len(web.looked_up) == 1

        clock.now += 2
        web.pages["https://www.beatport.com/track/t/7"] = sample("seven")
        web.audio[sample("seven")] = AUDIO
        assert catalog.preview(7) == PreviewAudio(AUDIO)
        assert samples.asked == [7, 7]

    def test_a_page_with_no_sample_is_tried_again_after_the_window(
        self, catalog, samples, web, clock
    ):
        samples.fail = True
        web.pages["https://www.beatport.com/track/t/7"] = ""
        assert catalog.preview(7) is None
        clock.now += RETRY_FAILED_AFTER_SECONDS + 1
        assert catalog.preview(7) is None
        assert len(web.looked_up) == 2

    def test_the_api_is_asked_outside_the_gate(self, samples, web):
        held: list[bool] = []

        class Gate(FetchGate):
            busy = False

            def run(self, key, request):
                self.busy = True
                try:
                    return super().run(key, request)
                finally:
                    self.busy = False

        gate = Gate()

        def lookup(track_id: int) -> str:
            held.append(gate.busy)
            return ""

        service = CatalogPreviewService(
            gate=gate, fetcher=web.fetch, sample_lookup=lookup, page_lookup=web.lookup
        )
        service.preview(7)
        assert held == [False]

    def test_a_non_positive_cache_size_is_refused(self):
        with pytest.raises(ValueError):
            CatalogPreviewService(limit=0)
