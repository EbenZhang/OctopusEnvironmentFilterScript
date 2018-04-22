// ==UserScript==
// @name       OctopusEnvFilter
// @namespace  https://github.com/EbenZhang/OctopusEnvironmentFilterScript
// @version    0.1
// @description  GreaseMonkey script to improve Octopus UI rendering performance by filtering the environments
// @include /https?://.*/app.*/
// @copyright  2018+, EbenZhang
// @require        https://raw.githubusercontent.com/fichtennadel/MonkeyConfig/0eaeb525733a36d9e721ec4d9cf3b744b527bfcf/monkeyconfig.js
// ==/UserScript==
var octopusEnvFilterCfg = new MonkeyConfig({
    title: 'OctopusEnvFilter Configuration',
    menuCommand: true,
    params: {
        environments: {
            type: 'custom',
            html: '<input type="text" style="width: 80em;" placeholder="regex, separate by comma" />',
            set: function (value, parent) {
                parent.querySelectorAll('input')[0].value = value;
            },
            get: function (parent) {
                return parent.querySelectorAll('input')[0].value
            },
            label: "Display only these environments",
            default: ""
        }
    }
});

(function () {

    function isProjectOverviewPage() {
        return window.location.href.match(/https?:\/\/.*\/app#\/projects\/.*\/overview\/?/i)
    }

    function isProjectResponse(respUrl) {
        return respUrl.match(/https?:\/\/.*\/api\/progression\/Projects-\/?/i)
    }

    function isEnvironmentPage() {
        return window.location.href.match(/https?:\/\/.*\/app#\/infrastructure\/environments/);
    }

    function isEnvironmentPageResponse(respUrl) {
        return respUrl.match(/https?:\/\/.*\/api\/environments\/all\/?/i);
    }

    function isEnvironmentPageSummaryResponse(respUrl) {
        return respUrl.match(/https?:\/\/.*\/api\/environments\/summary\/?/i);
    }

    function getEnvRegexes() {
        var envsRegexStr = cfg.get("environments");
        var envRegexes = envsRegexStr.split(',').map(function (x) { return new RegExp(x, "i"); });
        return envRegexes;
    }

    function modifyResponseForProjectOverviewPage(respText) {
        var resp = JSON.parse(respText);
        var envRegexes = getEnvRegexes();
        var envIds = [];
        if (resp.Environments) {
            resp.Environments = resp.Environments.filter(function (env) {
                return envRegexes.some(function (rx) { return rx.test(env.Name); });
            });
            console.log("Filtered environments:" + resp.Environments.map(function (x) { return x.Name; }));
            envIds = resp.Environments.map(function (x) { return x.Id; });
        }

        if (resp.ChannelEnvironments) {
            for (var channelEnv in resp.ChannelEnvironments) {
                resp.ChannelEnvironments[channelEnv] = resp.ChannelEnvironments[channelEnv].filter(function (env) {
                    return envIds.includes(env.Id);
                });
            }
        }

        if (resp.Releases) {
            for (var release of resp.Releases) {
                if (release.Deployments) {
                    var envsToDelete = Object.getOwnPropertyNames(release.Deployments).filter(function (r) {
                        return !envIds.includes(r);
                    });
                    for (var del in envsToDelete) {
                        delete release.Deployments[del];
                    }
                }
                if (release.NextDeployments) {
                    release.NextDeployments = release.NextDeployments.filter(function (dep) {
                        return envIds.includes(dep);
                    });
                }
            }
        }

        return resp
    }

    function modifyResponseForEnvironmentsPage(respText) {
        var resp = JSON.parse(respText);
        var envRegexes = getEnvRegexes();
        var newResp = resp.filter(function (env) {
            return envRegexes.some(function (rx) {
                return rx.test(env.Name);
            });
        });
        return newResp;
    }

    function modifyResponseForEnvironmentsPageSummary(respText) {
        var resp = JSON.parse(respText);
        var envRegexes = getEnvRegexes();
        resp.EnvironmentSummaries = resp.EnvironmentSummaries.filter(function (summary) {
            return envRegexes.some(function (rx) {
                return rx.test(summary.Environment.Name);
            });
        });
        return resp;
    }

    var cfg = octopusEnvFilterCfg;

    function modifyResponse(response) {
        if (this.readyState !== 4) {
            return;
        }
        var newResp = undefined;
        if (isProjectOverviewPage() && isProjectResponse(this.responseURL)) {
            newResp = modifyResponseForProjectOverviewPage(response.target.responseText);
        }

        if (isEnvironmentPage()) {
            if (isEnvironmentPageResponse(this.responseURL)) {
                newResp = modifyResponseForEnvironmentsPage(response.target.responseText);
            } else if (isEnvironmentPageSummaryResponse(this.responseURL)) {
                newResp = modifyResponseForEnvironmentsPageSummary(response.target.responseText);
            }
        }
        if (newResp !== undefined) {
            Object.defineProperty(this, "responseText", { writable: true });
            Object.defineProperty(this, "response", { writable: true });
            this.responseText = JSON.stringify(newResp);
            this.repsonse = newResp;
        }
    }

    function hookAjaxOpen(originalOpen) {
        return function (method, url, async) {
            this.addEventListener("readystatechange", modifyResponse);
            return originalOpen.apply(this, arguments);
        };

    }

    XMLHttpRequest.prototype.open = hookAjaxOpen(XMLHttpRequest.prototype.open);

})();
