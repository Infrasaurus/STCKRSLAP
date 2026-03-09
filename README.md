# STCKRSLAP
Share stickers with your friends (or strangers) on this virtual lamp pole!

## What is STCKRSLAP?
STCKRSLAP aims to recreate the sticker-slapping experience in a virtual environment.  No cops, no fines, no judgement; just good, old-fashioned sticker slapping!

## How do I use STCKRSLAP?
It's as simple as can be.  Upload stickers with the upload button (or drag and drop, if that's your jam), then drag them from the tray onto the canvas.  With a random wobble for artistic flair, the sticker is now stuck!

Stickers can be layered over one another.  Rotation is randomly determined at placement between -30 and 30 degrees from center; if your sticker is facing the wrong way, that's a problem with your sticker!

Supported formats are JPEG, PNG, WEBP, and GIF.  Yes, you can stick animated GIFs, you beautiful diamond.  Anything larger than 5MB or 2048px will be resized though, so don't go _too_ crazy.

## How do I run my own STCKRSLAP?
You can pull the latest version directly from GitHub's container registry, `ghcr.io/infrasaurus/stckrslap:latest`.  This is the easiest way to get started and makes it compatible with Podman, Docker Desktop, Kubernetes, or whatever you prefer managing containers with.

STCKRSLAP is also offered in source code format with a `dockerfile`.  Simply clone the code and run `docker build -f Dockerfile.dockerbuild -t stckrslap .` to build the image.

When hosting STCKRSLAP, note that **HTTPS is not offered**, and the service runs over port [10014](https://en.wikipedia.org/wiki/Stonewall_Inn).  This shouldn't be a problem since it collects no logs and stores no data, but security-minded folks will want to use some sort of proxy or load balancer if you want HTTPS.

Want the instance to be a little more private? You can define a unique string to join in the `{INVITE_KEY}` environment variable; append this to the end of the URL to join (e.g., `http://www.your.site/INVITE_KEY`).

### _This seems a little insecure..._ 😨
That's by design.  This is meant to be ephemeral, fleeting, anonymous, open - all the good stuff, none of the bad.

If you're thinking of using this in any sort of production capacity: **don't.**

## How do I save my STCKRSLAP?
Why would you want to? The beauty of slapping stickers is you never know how long they'll last before the pole is scraped, painted, or cleaned up in real life - and we do the same thing by storing no permanent data, not even user identifiers.  When the container resets, so does the canvas!

That said, nothing's stopping you from capturing screenshots of your artwork.  If you're proud of your work, snap away!

## Can I sell this in some form?
**No, you absolutely cannot!** The code to this project is MIT-licensed as it's from an LLM, but the core concept remains mine.  Feel free to run this for your friends, but commercialization is prohibited.
