#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>
#include <filesystem>
#include <cstdlib>
#include <sys/wait.h>
#include <unistd.h>

namespace fs = std::filesystem;

// Helper: trim whitespace from both ends
static std::string trim(const std::string &s) {
    size_t start = 0;
    while (start < s.size() && std::isspace(static_cast<unsigned char>(s[start]))) ++start;
    size_t end = s.size();
    while (end > start && std::isspace(static_cast<unsigned char>(s[end-1]))) --end;
    return s.substr(start, end - start);
}

// Helper: split into tokens ignoring any whitespace
static std::vector<std::string> tokenize(const std::string &s) {
    std::vector<std::string> toks;
    std::istringstream iss(s);
    std::string token;
    while (iss >> token) {
        toks.push_back(token);
    }
    return toks;
}

// Compare two strings whitespace‑insensitively
static bool compare_output(const std::string &got, const std::string &expected) {
    return tokenize(got) == tokenize(expected);
}

int main() {
    // 1. Compile submission.cpp
    const std::string compile_cmd = "g++ -std=c++17 -O2 -pipe -static -s submission.cpp -o solution";
    int compile_status = std::system(compile_cmd.c_str());
    if (WIFEXITED(compile_status) && WEXITSTATUS(compile_status) != 0) {
        std::cout << "STATUS: CE" << std::endl;
        return 0;
    }
    if (!WIFEXITED(compile_status)) {
        std::cout << "STATUS: CE" << std::endl;
        return 0;
    }

    // 2. Discover test cases (input*.txt)
    std::vector<fs::path> inputs;
    for (const auto &entry : fs::directory_iterator(".")) {
        if (!entry.is_regular_file()) continue;
        std::string name = entry.path().filename().string();
        if (name.rfind("input", 0) == 0 && entry.path().extension() == ".txt") {
            inputs.push_back(entry.path());
        }
    }
    if (inputs.empty()) {
        // No test cases – treat as AC
        std::cout << "STATUS: AC" << std::endl;
        return 0;
    }
    // Sort to ensure deterministic order (input1.txt, input2.txt, ...)
    std::sort(inputs.begin(), inputs.end());

    // Optional time limit per test (seconds). Can be overridden by env var TIME_LIMIT_SEC.
    int time_limit_sec = 2; // default 2 seconds
    if (const char *env = std::getenv("TIME_LIMIT_SEC")) {
        try { time_limit_sec = std::stoi(env); } catch (...) {}
    }

    for (const auto &in_path : inputs) {
        // Derive expected output path
        std::string out_name = in_path.filename().string();
        // replace leading "input" with "output"
        if (out_name.rfind("input", 0) == 0) {
            out_name.replace(0, 5, "output");
        } else {
            // no matching output file – treat as WA
            std::cout << "STATUS: WA" << std::endl;
            return 0;
        }
        fs::path expected_path = in_path.parent_path() / out_name;
        if (!fs::exists(expected_path)) {
            std::cout << "STATUS: WA" << std::endl;
            return 0;
        }

        // Build command: timeout <limit>s ./solution < input > __tmp_out.txt
        std::string cmd = "timeout " + std::to_string(time_limit_sec) + "s ./solution < " + in_path.string() + " > __tmp_out.txt";
        int run_status = std::system(cmd.c_str());
        // Check timeout (124 is timeout's exit code)
        if (WIFEXITED(run_status) && WEXITSTATUS(run_status) == 124) {
            std::cout << "STATUS: TLE" << std::endl;
            return 0;
        }
        if (!WIFEXITED(run_status) || WEXITSTATUS(run_status) != 0) {
            // Runtime error – treat as WA for simplicity
            std::cout << "STATUS: WA" << std::endl;
            return 0;
        }

        // Read both outputs
        std::ifstream got_file("__tmp_out.txt");
        std::ifstream exp_file(expected_path);
        std::stringstream got_buf, exp_buf;
        got_buf << got_file.rdbuf();
        exp_buf << exp_file.rdbuf();
        std::string got = got_buf.str();
        std::string expected = exp_buf.str();
        // Clean up temporary output file
        fs::remove("__tmp_out.txt");

        if (!compare_output(got, expected)) {
            std::cout << "STATUS: WA" << std::endl;
            return 0;
        }
    }

    // All test cases passed
    std::cout << "STATUS: AC" << std::endl;
    return 0;
}
